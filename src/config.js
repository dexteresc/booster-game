// All gameplay tunables. The sim reads this every tick, so edits from the
// tuning panel (press ` or tap ⚙) apply live. Units: px, seconds, radians.
export const config = {
  tickRate: 120,

  world: {
    gravity: 250,
  },

  rocket: {
    thrust: 260, // acceleration per engine. Both engines = 2x
    engineOffset: 12, // "balance": distance from center to each engine. Far out = spins fast, near center = stable but slow to steer
    inertia: 600, // resistance to spinning
    spinDamping: 1.5, // how fast spin bleeds off
    drag: 0.15, // linear air drag
    safeLandingAngle: 1.0, // ~57°, feet touching more tilted than this = crash. Any speed is fine; nose/side contact always crashes
    hitRadius: 14, // bullet hit radius
  },

  rules: {
    respawnSeconds: 3,
    capturesToWin: 3,
    cpuKillsToWin: 10, // PvE: the computer wins after its turrets shoot players down this often (crashes don't count)
    flagPickupRadius: 30,
  },

  cannon: {
    enabled: true,
    range: 900,
    bulletSpeed: 350,
    fireInterval: 1.2,
    turnSpeed: 1.5, // barrel rotation speed
    aimTolerance: 0.1, // only fires when barrel is this close to the aim point
    leadTarget: true, // aim where the rocket is going, not where it is
  },

  view: {
    size: 1400, // world units visible along the screen's longest edge
  },

  keys: {
    left: ['ShiftLeft', 'ArrowLeft'],
    right: ['ShiftRight', 'ArrowRight'],
  },
}
