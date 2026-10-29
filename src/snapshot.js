import { TEAMS } from './maps/parse.js'

// Host → joiner game state, 20×/s, as bytes instead of JSON (~10× smaller). Only what moves or
// what the screen shows. Who's who, the map and the mode come once in a { type: 'roster' }
// message, and rockets here are in that roster's order.
//
// Little-endian. d = float64, f = float32, s = uint16, b = uint8:
//   header  d time, b winner (0 none, 1 + team index), per team: b score, b flag carrier (rocket index, 255 none),
//           b rockets, b cannons, s bullets, b events
//   rocket  f x, f y, f angle, f respawnAt, b flags (1 alive, 2 left engine, 4 right engine)
//   cannon  f aim, f cooldown
//   bullet  f x, f y, f vx, f vy, b team index
//   event   b kind, b team index, f x, f y
const HEADER = 8 + 1 + TEAMS.length * 2 + 5
const ROCKET = 17
const CANNON = 8
const BULLET = 17
const EVENT = 10
const NONE = 255
const EVENT_KINDS = ['explode', 'capture']
const ALIVE = 1
const LEFT = 2
const RIGHT = 4

export function encodeSnapshot(game, events) {
  const { rockets, cannons, bullets } = game
  const out = writer(HEADER + rockets.length * ROCKET + cannons.length * CANNON + bullets.length * BULLET + events.length * EVENT)
  out.d(game.time)
  out.b(game.winner ? TEAMS.indexOf(game.winner) + 1 : 0)
  for (const team of TEAMS) {
    const carrier = rockets.findIndex((r) => r.id === game.teams[team].flagCarrier)
    out.b(game.teams[team].score, carrier < 0 ? NONE : carrier)
  }
  out.b(rockets.length, cannons.length)
  out.s(bullets.length)
  out.b(events.length)
  for (const r of rockets) writeRocket(out, r)
  for (const c of cannons) out.f(c.aim, c.cooldown)
  for (const b of bullets) {
    out.f(b.x, b.y, b.vx, b.vy)
    out.b(TEAMS.indexOf(b.team))
  }
  for (const e of events) {
    out.b(EVENT_KINDS.indexOf(e.type), TEAMS.indexOf(e.team))
    out.f(e.x ?? 0, e.y ?? 0)
  }
  return out.done()
}

function writeRocket(out, r) {
  out.f(r.x, r.y, r.angle, r.respawnAt ?? 0)
  out.b((r.alive ? ALIVE : 0) | (r.input.left ? LEFT : 0) | (r.input.right ? RIGHT : 0))
}

// ids: rocket ids in roster order.
export function decodeSnapshot(buffer, ids) {
  const at = reader(buffer)
  const time = at.d()
  const winner = TEAMS[at.b() - 1] ?? null
  const carriers = TEAMS.map(() => [at.b(), at.b()])
  const [rocketCount, cannonCount, bulletCount, eventCount] = [at.b(), at.b(), at.s(), at.b()]
  if (rocketCount !== ids.length) throw new Error(`Snapshot has ${rocketCount} rockets, roster has ${ids.length}. Roster message missed?`)
  const teams = Object.fromEntries(TEAMS.map((team, i) => [team, { score: carriers[i][0], flagCarrier: ids[carriers[i][1]] ?? null }]))
  const rockets = ids.map((id) => {
    const [x, y, angle, respawnAt] = [at.f(), at.f(), at.f(), at.f()]
    const flags = at.b()
    return { id, x, y, angle, respawnAt, alive: Boolean(flags & ALIVE), input: { left: Boolean(flags & LEFT), right: Boolean(flags & RIGHT) } }
  })
  const cannons = times(cannonCount, () => ({ aim: at.f(), cooldown: at.f() }))
  const bullets = times(bulletCount, () => ({ x: at.f(), y: at.f(), vx: at.f(), vy: at.f(), team: TEAMS[at.b()] }))
  const events = times(eventCount, () => ({ type: EVENT_KINDS[at.b()], team: TEAMS[at.b()], x: at.f(), y: at.f() }))
  at.end()
  return { time, winner, teams, rockets, cannons, bullets, events }
}

const times = (n, make) => Array.from({ length: n }, make)

function writer(size) {
  const view = new DataView(new ArrayBuffer(size))
  let at = 0
  const put = (set, bytes, max) => (...values) => {
    for (const v of values) {
      if (max !== undefined && !(Number.isInteger(v) && v >= 0 && v <= max)) throw new RangeError(`Snapshot field at byte ${at}: ${v} isn't an integer 0–${max}`)
      view[set](at, v, true)
      at += bytes
    }
  }
  return {
    d: put('setFloat64', 8),
    f: put('setFloat32', 4),
    s: put('setUint16', 2, 0xffff),
    b: put('setUint8', 1, 0xff),
    done() {
      if (at !== size) throw new Error(`Snapshot wrote ${at} bytes, sized for ${size}`)
      return view.buffer
    },
  }
}

// Reading past the end throws (DataView's RangeError).
function reader(buffer) {
  const view = new DataView(buffer)
  let at = 0
  const get = (read, bytes) => () => {
    const v = view[read](at, true)
    at += bytes
    return v
  }
  return {
    d: get('getFloat64', 8),
    f: get('getFloat32', 4),
    s: get('getUint16', 2),
    b: get('getUint8', 1),
    end() {
      if (at !== view.byteLength) throw new Error(`Snapshot has ${view.byteLength - at} unread bytes: host runs another version?`)
    },
  }
}
