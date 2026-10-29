import { TEAM } from './art/theme.js'
import { TEAMS } from './maps/parse.js'

// PvP lobby: who's in and on which team. The host owns the list and sends it to
// joiners as { type: 'lobby', players, mapName } until the match starts.
export const TEAM_SIZE = 4 // maps.test.js checks every PvP pad has room for this many

const countOn = (players, team) => players.filter((p) => p.team === team).length

// New players go to the smaller team. null = both teams full.
export function teamFor(players) {
  const [smaller] = [...TEAMS].sort((a, b) => countOn(players, a) - countOn(players, b))
  return countOn(players, smaller) < TEAM_SIZE ? smaller : null
}

// Moves a player to the other team if it has room. Returns whether they moved.
export function switchTeam(players, id) {
  const player = players.find((p) => p.id === id)
  const other = TEAMS.find((t) => t !== player?.team)
  if (!player || countOn(players, other) >= TEAM_SIZE) return false
  player.team = other
  return true
}

// lobby: { players, mapName }. Host gets the buttons: actions { onSwitch(id), onStart(), onInvite() }.
export function renderLobby(panel, lobby, { localId, code, actions }) {
  panel.hidden = false
  panel.querySelector('.lobby-room').textContent = `Room ${code} · map ${lobby.mapName}`
  panel.querySelector('.lobby-invite').hidden = !actions
  panel.querySelector('.lobby-start').hidden = !actions
  panel.querySelector('.lobby-wait').hidden = Boolean(actions)
  if (actions) {
    panel.querySelector('.lobby-invite').onclick = actions.onInvite
    panel.querySelector('.lobby-start').onclick = actions.onStart
  }
  const columns = TEAMS.map((team) => teamColumn(team, lobby.players, { localId, actions }))
  panel.querySelector('.lobby-teams').replaceChildren(...columns)
}

function teamColumn(team, players, { localId, actions }) {
  const section = document.createElement('section')
  section.style.setProperty('--team', TEAM[team].accent)
  const members = players.filter((p) => p.team === team)
  const heading = section.appendChild(document.createElement('h3'))
  heading.textContent = `${TEAM[team].label} ${members.length}/${TEAM_SIZE}`
  const list = section.appendChild(document.createElement('ul'))
  const otherFull = countOn(players, team === 'blue' ? 'red' : 'blue') >= TEAM_SIZE
  for (const p of members) list.appendChild(playerRow(p, { you: p.id === localId, actions, otherFull }))
  return section
}

function playerRow(player, { you, actions, otherFull }) {
  const row = document.createElement('li')
  row.append(player.name + (you ? ' (you)' : ''))
  if (!actions) return row
  const move = row.appendChild(document.createElement('button'))
  move.textContent = player.team === 'blue' ? '→' : '←'
  move.setAttribute('aria-label', `Move ${player.name} to the other team`)
  move.disabled = otherFull
  move.onclick = () => actions.onSwitch(player.id)
  return row
}
