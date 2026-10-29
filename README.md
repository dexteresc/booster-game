# Booster

Two-engine rocket capture-the-flag in the browser. Pick a mode on the start screen:

- **PvE**: co-op vs the computer. Steal red's flag, land it on your pad. Red wins if its turrets shoot you
  down often enough first (`rules.cpuKillsToWin`; crashes don't count). Invite friends to fly with you.
- **PvP**: team capture-the-flag, up to 4 v 4, on symmetric maps where each team's turrets guard its base.
  The host opens a lobby, shares the invite link and moves players between teams, then starts the match.
  After a win everyone goes back to the lobby.

Your name shows above your rocket for the others: blue for your team, red for theirs.
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
| `src/net.js`, `src/snapshot.js`, `src/remote-game.js` | Multiplayer: connections, the binary snapshot format, joiner-side smoothing |
| `src/maps/*.json` | Maps, one file each. Picked up automatically |
| `src/editor/` | Map editor |
| `worker/` | Cloudflare Worker for TURN relay credentials |

### Maps

`npm run editor`, draw, ⌘S. Saves `src/maps/<name>.json` and reloads open game tabs.
A map has a biome (desert, jungle, nautic): it sets how rock looks, the hills behind the map, the rain
odds and which blocks the editor offers. Blocks are solid; props (lamps, signs, saucers…) are decoration
that rockets fly through, and all props work in every biome. New material, prop or biome: `src/art/solids.js`,
`src/art/props/` or `src/art/theme.js` BIOMES (+ ground art in `src/art/ground.js`), then its name in
`src/maps/parse.js`; the editor and `/art.html` pick it up.
A map has a mode. PvE maps: orange pad for the players, red pad and cannons for the computer. PvP maps must be
symmetric (`npm test` checks): build the left half, press Mirror. Cannons belong to the side they stand on.
Commit the JSON to ship it. Saving only works on the dev server; the editor isn't deployed.
Play a map with `?map=<name>` (skips the start screen) or the dropdown in the game; it lists the current mode's maps.

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
