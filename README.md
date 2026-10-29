# Booster

Two-engine rocket capture-the-flag in the browser. Co-op vs CPU: steal red's flag, land it on your pad.
Multiplayer is peer-to-peer, see [TURN.md](TURN.md).

Live: https://nqvst.github.io/booster-game/

## Develop

```bash
npm install
npm run dev      # game at http://localhost:5173, art preview at /art.html
npm run editor   # map editor at /editor.html
npm test
npm run lint
```

| Path | What |
| --- | --- |
| `src/sim/` | Game rules. Pure, no DOM: same inputs → same state |
| `src/art/`, `src/render.js` | Drawing |
| `src/net.js` | Multiplayer |
| `src/maps/*.json` | Maps, one file each. Picked up automatically |
| `src/editor/` | Map editor |
| `worker/` | Cloudflare Worker for TURN relay credentials |

### Maps

`npm run editor`, draw, ⌘S. Saves `src/maps/<name>.json` and reloads open game tabs.
Commit the JSON to ship it. Saving only works on the dev server; the editor isn't deployed.
Play a map with `?map=<name>` or the dropdown in the game.

## Release

GitHub Pages deploys on every push to `main` (`.github/workflows/pages.yml`):
lint → test → build → deploy. A failing lint or test stops the deploy.

1. Check locally: `npm run lint && npm test && npm run build`
2. Worker changed? Deploy it first (see below): the game on `main` may depend on it.
3. Push or merge to `main`.
4. Watch the run in the repo's Actions tab, ~1 min.
5. Smoke test on the live URL: start a game, Invite, join from a phone on mobile data (not wifi).
   That's the case that needs the relay.

The Worker is **not** deployed by CI. Deploy it by hand when anything in `worker/` changes:

```bash
cd worker
npx wrangler deploy
```

Rollback: revert the commit on `main` and push. For the Worker, `npx wrangler rollback` in `worker/`.
