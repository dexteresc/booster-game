// The whole look in one place. Style: Zeerust (1950s–60s retro-futurism) —
// cream plastic and chrome, orange trim, fins and portholes, glowing lasers.
// Tweak here and check /art.html (npm run dev).

const GUNMETAL = ['#c9ccd2', '#8d929b', '#4a4e57'] // light, mid, shadow

export const TEAM = {
  blue: { label: 'ORANGE', accent: '#ff7a1a', hull: ['#fffaf0', '#efe2c4', '#a8977a'], laser: '#ff3b2f' },
  red: { label: 'RED', accent: '#e0312b', hull: GUNMETAL, laser: '#3dff5a' },
}

export const COLOR = {
  outline: '#2a2420',
  meOutline: '#ffffff', // local player's rocket
  cream: '#f6eedb',
  creamShade: '#cdbf9f',
  creamShaded: ['#fff8ea', '#e9dcbd', '#a8977a'], // for shaded(): light, mid, shadow
  gunmetal: GUNMETAL,
  chrome: [[0, '#4a5058'], [0.3, '#f4f6f8'], [0.5, '#9aa2ac'], [0.68, '#e6eaee'], [1, '#3e434a']], // banded, left → right
  metalDark: '#23262c',
  canopy: '#1b2230',
  canopyGlint: 'rgba(170,225,255,0.75)',
  gloss: 'rgba(255,255,255,0.5)',
  rivet: 'rgba(80,60,40,0.45)',
  flame: ['rgba(255,255,235,1)', 'rgba(255,160,60,0.9)', 'rgba(255,60,20,0)'], // nozzle → tip

  void: '#120c0c', // outside the map
  star: '#fff6e0',
  beacon: '#ff4a3a',
  shipLight: '#fff2d0',
  windowLight: '#ffcf7a',
  lampLight: '#ffe7b3',
  trim: '#ff7a1a', // orange signage and trim bands
  signal: '#e0312b', // red lenses, sign centers
  teal: '#3fb6b0',
  tealDeep: '#1d6a70',
  hazard: '#f2b233', // mustard, with dark stripes
  shadow: 'rgba(0,0,0,0.28)', // contact shadow under props
  seam: 'rgba(0,0,0,0.22)', // joints between concrete blocks and metal plates
  seamLit: 'rgba(255,255,255,0.14)',
  lip: 'rgba(255,255,255,0.35)', // lit top edge of blocks
  rivetDark: 'rgba(0,0,0,0.4)',
  ripple: 'rgba(255,220,190,0.12)',
  foam: 'rgba(255,240,220,0.7)',
  strata: 'rgba(0,0,0,0.12)',

  spark: ['#fff1c2', '#ffb347', '#ff6a1f'],
  smoke: '#2e2422',

  text: '#fff3dc',
  textDim: 'rgba(255,243,220,0.75)',
  textShadow: 'rgba(0,0,0,0.6)',
}

// Time of day. Each game picks one at random, with or without rain.
// suns: x, y as a share of map size; glow: halo strength.
export const SKIES = {
  dusk: {
    sky: [[0, '#05061a'], [0.45, '#1e1838'], [0.72, '#6a3346'], [0.88, '#d46a3c'], [1, '#ffb36b']],
    stars: 1,
    suns: [{ x: 0.62, y: 0.7, r: 30 }, { x: 0.665, y: 0.735, r: 18 }],
    sun: '#fff4d6',
    sunGlow: '#ffb060',
    glow: 0.45,
    cloud: ['rgba(60,36,70,0.7)', 'rgba(240,130,90,0.7)'], // shadowed top, lit underside
    mesas: ['#9a5060', '#6e3a52', '#4a2843', '#2e1a30'], // far → near
    haze: ['rgba(240,130,90,0)', 'rgba(240,130,90,0.3)'], // fog at the foot of each mesa layer
    windows: 1, // how many mesa windows are lit
    water: ['rgba(20,30,70,0.2)', 'rgba(6,10,28,0.8)'], // tint over the reflection: surface → depth
    waterLine: 'rgba(255,210,170,0.6)',
    glint: '#ffe2b0',
    rock: ['#c98a55', '#9a5a36', '#6e3c26'], // lit top → base
    rockLip: '#e8b07a',
    concrete: ['#c2aa9c', '#8f7a72', '#5a4a47'], // lit top → base
    metal: ['#b49690', '#5f5056', '#2c252b'],
    panel: ['#ffe2bf', '#d9b48c', '#9a7556'], // cream panels: lit, base, shade
    glass: ['#6fbfc0', '#255f6c'], // pane: top, bottom
    overcast: 'rgba(60,50,70,0.5)', // rain only
    rainCloud: ['rgba(50,40,60,0.9)', 'rgba(120,80,80,0.85)'],
  },
  day: {
    sky: [[0, '#2f6db5'], [0.5, '#7fb3e0'], [0.85, '#e9d9bd'], [1, '#f6e4c4']],
    stars: 0,
    suns: [{ x: 0.7, y: 0.18, r: 28 }, { x: 0.76, y: 0.22, r: 16 }],
    sun: '#fffef5',
    sunGlow: '#fff2c0',
    glow: 0.3,
    cloud: ['rgba(255,255,255,0.85)', 'rgba(215,210,205,0.85)'],
    mesas: ['#c8ab9c', '#b98e78', '#a0725a', '#835a44'],
    haze: ['rgba(240,230,215,0)', 'rgba(240,230,215,0.35)'],
    windows: 0,
    water: ['rgba(30,110,150,0.25)', 'rgba(10,40,70,0.8)'],
    waterLine: 'rgba(255,255,255,0.7)',
    glint: '#ffffff',
    rock: ['#e2a66c', '#b8743f', '#8a5030'],
    rockLip: '#f6cf98',
    concrete: ['#dcd6cc', '#aaa49b', '#78726b'],
    metal: GUNMETAL,
    panel: ['#fff8e6', '#efe4c8', '#c9bb9a'],
    glass: ['#8fe0da', '#2f8f96'],
    overcast: 'rgba(120,128,140,0.6)',
    rainCloud: ['rgba(150,155,165,0.9)', 'rgba(110,115,128,0.9)'],
  },
  night: {
    sky: [[0, '#010208'], [0.55, '#070b24'], [0.9, '#18204a'], [1, '#26306a']],
    stars: 1,
    suns: [{ x: 0.3, y: 0.25, r: 26 }], // moon
    sun: '#eef3ff',
    sunGlow: '#7fa0ff',
    glow: 0.35,
    cloud: ['rgba(10,12,25,0.8)', 'rgba(50,60,100,0.6)'],
    mesas: ['#262b4a', '#1c2040', '#141734', '#0d0f24'],
    haze: ['rgba(70,90,150,0)', 'rgba(70,90,150,0.25)'],
    windows: 1.6,
    water: ['rgba(10,15,40,0.2)', 'rgba(2,4,12,0.85)'],
    waterLine: 'rgba(170,190,255,0.5)',
    glint: '#cfe0ff',
    rock: ['#6a6488', '#47405e', '#2a2540'],
    rockLip: '#a6a8d8',
    concrete: ['#62657f', '#42445c', '#262738'],
    metal: ['#525869', '#303441', '#161821'],
    panel: ['#9aa0c8', '#6b6f99', '#3f4166'],
    glass: ['#3f8690', '#143a44'],
    overcast: 'rgba(12,14,24,0.55)',
    rainCloud: ['rgba(20,22,34,0.95)', 'rgba(40,44,62,0.9)'],
  },
}

export const RAIN = {
  chance: 0.35,
  drop: 'rgba(200,215,235,0.35)',
  splash: 'rgba(220,230,245,0.5)',
  lightning: 'rgba(230,235,255,0.55)',
}

export const FONT = 'Futura, "Avenir Next", "Century Gothic", "Segoe UI", system-ui, sans-serif'
