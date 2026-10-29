# Networking and TURN

## How multiplayer works

Peer-to-peer over WebRTC with [PeerJS](https://peerjs.com). No game server. Code: `src/net.js`.

```
           ┌──────────── handshake only ────────────┐
           │  PeerJS public server (0.peerjs.com)   │
           └──────▲──────────────────────────▲──────┘
                  │                          │
 Host browser ◄───┴── game traffic ──────────┴───► Joiner browser
 (runs the sim)   direct, or via Cloudflare TURN relay when direct fails
                  ▲                          ▲
                  └── relay credentials ─────┘
                 Worker: booster-turn.nqvst.workers.dev
```

1. **Credentials.** Before hosting or joining, the game GETs short-lived TURN credentials from our
   Worker (`worker/turn.js`). The TURN secret lives only in the Worker.
2. **Host.** Invite registers `booster-game-<CODE>` on the PeerJS server. The link is
   `…/?map=<map>#<CODE>`, so joiners load the same map.
3. **Join.** The joiner looks up that ID; the PeerJS server passes the WebRTC handshake between the two.
4. **Connect.** Browsers try direct first (STUN finds public addresses). If NAT or a firewall blocks that
   (mobile data, office wifi, strict routers), traffic goes through Cloudflare's TURN relay.
5. **Play.** The host runs the only sim. Joiners send `{ type: 'input', left, right }` every frame;
   the host sends `{ type: 'snapshot', … }` 30 times a second. Room full → `{ type: 'full' }`.

### Timeouts

| What | Limit | Where |
| --- | --- | --- |
| Fetching relay credentials | 5 s | `CREDENTIALS_TIMEOUT_MS` in `src/net.js` |
| Joining (handshake + connect) | 15 s | `JOIN_TIMEOUT_MS` in `src/net.js` |
| Silence before a player or the host counts as gone | 5 s | `TIMEOUT_MS` in `src/net.js` |
| Relay credentials valid for | 24 h | `TTL_SECONDS` in `worker/turn.js` |

### What the errors mean

| Status message | Cause |
| --- | --- |
| `couldn't get relay credentials from …` | Worker down, wrong URL, or page origin not in `ALLOWED_ORIGINS` |
| `Could not connect to peer booster-game-XXXX` | Wrong code, or the host closed the tab |
| `no answer from host after 15s…` | Browsers found no route, even through the relay |
| `Negotiation of connection to … failed` | Same, but WebRTC gave up before the timeout |
| `Lost connection to host` / `Host left` | Connection dropped mid-game |
| `Room is full` | Host's team pad has no free spawn slot |

### Known gaps

- If the host's connection to the PeerJS server drops (wifi blip, laptop sleep), players already in
  the game carry on, but new joins fail with "Could not connect to peer". The host isn't told.
  Fix: handle PeerJS's `disconnected` event with `peer.reconnect()`.
- The PeerJS server is the free public one, with no uptime guarantee.
- A host's relay credentials are fetched once, so sessions over 24 h may stop accepting joiners who
  need the relay.

## The TURN Worker

`worker/turn.js`, config in `worker/wrangler.toml`, live at https://booster-turn.nqvst.workers.dev.

- `GET /` from an allowed origin → `{ iceServers: [...] }` from Cloudflare's
  `generate-ice-servers` API. Other origins → 403.
- `TURN_KEY_ID` (in `wrangler.toml`, not secret) and `TURN_KEY_API_TOKEN` (Worker secret) identify
  the TURN key in Cloudflare (dashboard → Realtime → TURN).
- Free tier: 1,000 GB relay traffic per month (as of Oct 2026). Usage shows in the dashboard.
- The origin check stops other websites using the relay, not a determined script (it can fake
  `Origin`). Credentials expire, and the key can be rotated.

All commands below run in `worker/` (or add `--config worker/wrangler.toml` from the repo root;
from the root without it, Wrangler tries to deploy the whole Vite app).
First time on a machine: `npx wrangler login`.

### Common changes

**Allow another origin** (custom domain, phone testing on LAN like `http://192.168.1.20:5173`):
add it to `ALLOWED_ORIGINS` in `wrangler.toml`, comma-separated, then `npx wrangler deploy`.

**Rotate the token** (leaked, or routine): create a new API token for the TURN key in the dashboard, then

```bash
npx wrangler secret put TURN_KEY_API_TOKEN
```

paste the token when asked (never as an argument, it would land in shell history). Takes effect
immediately. Then delete the old token in the dashboard. New TURN key instead? Also update
`TURN_KEY_ID` in `wrangler.toml` and `npx wrangler deploy`.

**Change credential lifetime:** `TTL_SECONDS` in `turn.js`, then `npx wrangler deploy`.

**Move or rename the Worker:** change `name` in `wrangler.toml`, deploy, then update
`TURN_CREDENTIALS_URL` in `src/net.js` and release the game.

**Turn the relay off:** set `TURN_CREDENTIALS_URL = ''` in `src/net.js`. The game falls back to
PeerJS's free public relay and logs a warning.

### Debugging

```bash
npx wrangler tail      # live Worker logs, incl. Cloudflare API errors
```

Test the Worker from a terminal (prints credentials, don't paste them anywhere):

```bash
curl -H "Origin: https://nqvst.github.io" https://booster-turn.nqvst.workers.dev/
```

Call Cloudflare directly, bypassing the Worker, to check the token:

```bash
curl -H "Authorization: Bearer $CF_TURN_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"ttl": 86400}' \
  https://rtc.live.cloudflare.com/v1/turn/keys/ef80c8f0392410356da52938acbaa5e9/credentials/generate-ice-servers
```

To prove the relay works in a browser, force it on a joiner: open the game, then in the console
wrap `RTCPeerConnection` to add `iceTransportPolicy: 'relay'` before joining. A successful join
then has only `relay` candidates (check `chrome://webrtc-internals`).
