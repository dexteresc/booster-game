// The whole look in one place. Style: Zeerust (1950s–60s retro-futurism) —
// cream plastic and chrome, orange trim, fins and portholes, glowing lasers.
// Tweak here and check /art.html (npm run dev).

import type { Biome, SolidKind, Team } from '../maps/parse.ts'

export type Palette = readonly [light: string, mid: string, shadow: string]
export type GroundColors = { body: Palette; lip: string }

const GUNMETAL = ['#c9ccd2', '#8d929b', '#4a4e57'] as const satisfies Palette // light, mid, shadow

export const TEAM = {
  blue: { label: 'ORANGE', accent: '#ff7a1a', hull: ['#fffaf0', '#efe2c4', '#a8977a'], laser: '#ff3b2f' },
  red: { label: 'RED', accent: '#e0312b', hull: GUNMETAL, laser: '#3dff5a' },
} as const satisfies Record<Team, { label: string; accent: string; hull: Palette; laser: string }>

export type TeamColors = (typeof TEAM)[Team]

// A map's biome. blocks: what the editor offers, in order. hills: backdrop shape (art/hills.ts).
// tint: multiplied over the hills. rain: chance of a rainy game. skies: the times of day (SKIES) it gets.
const EARTH_SKIES = ['dusk', 'day', 'night'] as const
export const BIOMES = {
  desert: { label: 'Desert', blocks: ['rock', 'water', 'stone', 'concrete', 'metal', 'hazard', 'panel', 'glass'], hills: 'butte', tint: null, rain: 0.3, skies: EARTH_SKIES },
  jungle: { label: 'Jungle', blocks: ['rock', 'water', 'stone', 'planks', 'concrete', 'metal', 'hazard', 'glass'], hills: 'canopy', tint: '#8fcf8a', rain: 0.6, skies: EARTH_SKIES },
  nautic: { label: 'Nautic', blocks: ['rock', 'water', 'hull', 'planks', 'metal', 'hazard', 'glass'], hills: 'island', tint: '#9ac0dc', rain: 0.45, skies: EARTH_SKIES },
  belt: { label: 'Asteroid belt', blocks: ['rock', 'metal', 'panel', 'hazard', 'glass', 'concrete'], hills: 'belt', tint: null, rain: 0, skies: ['space'] },
} as const satisfies Record<Biome, {
  label: string
  blocks: readonly (SolidKind | 'rock')[]
  hills: string
  tint: string | null
  rain: number
  skies: readonly Time[]
}>

export type HillShape = (typeof BIOMES)[Biome]['hills']

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
  minimapBack: 'rgba(10,14,30,0.6)',
  minimapSolid: 'rgba(255,243,220,0.55)',
  pin: '#ffffff', // objective pointer
  pinFrame: '#000000',
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
  edgeShade: 'rgba(0,0,0,0.22)', // their right edge, fading in
  rivetDark: 'rgba(0,0,0,0.4)',
  rust: 'rgba(170,80,30,0.45)', // streaks down ship hulls
  moss: '#6fae4e',
  stoneShaded: ['#b3ad9c', '#857f6e', '#55504a'], // statues, for shaded(): light, mid, shadow
  barnacle: 'rgba(230,235,230,0.55)',
  coral: '#ff8a5c',
  ripple: 'rgba(255,220,190,0.12)',
  foam: 'rgba(255,240,220,0.7)',
  strata: 'rgba(0,0,0,0.12)',

  spark: ['#fff1c2', '#ffb347', '#ff6a1f'],
  smoke: '#2e2422',
  exhaust: '#c8c2d4', // engine puffs: pale, so they show against night and space

  ally: '#2f7bff', // name badges: your team
  enemy: '#e0312b', // name badges: the other team
  text: '#fff3dc',
  textDim: 'rgba(255,243,220,0.75)',
  textShadow: 'rgba(0,0,0,0.6)',
} as const

// Time of day. Each game picks one at random, with or without rain (odds per biome).
// suns: x, y as a share of map size; glow: halo strength.
// bloom: how strongly bright things glow; low by day, when the whole sky is bright.
const EARTH = {
  dusk: {
    bloom: 0.45,
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
    ground: {
      // body: lit top → base. lip: the top edge
      desert: { body: ['#c98a55', '#9a5a36', '#6e3c26'], lip: '#e8b07a' },
      jungle: { body: ['#8c8a5e', '#5a5a40', '#38382a'], lip: '#b8b85a' },
      nautic: { body: ['#8a7e84', '#564e58', '#332e36'], lip: '#f0c8b0' },
      belt: { body: ['#a08478', '#6a5450', '#3e3032'], lip: '#e6b896' },
    },
    wood: ['#d49060', '#9a5c34', '#5e3620'], // planks: light, mid, dark
    stone: ['#b59a84', '#7f6a5e', '#4d4038'], // temple blocks: lit top → base
    concrete: ['#c2aa9c', '#8f7a72', '#5a4a47'], // lit top → base
    metal: ['#b49690', '#5f5056', '#2c252b'],
    panel: ['#ffe2bf', '#d9b48c', '#9a7556'], // cream panels: lit, base, shade
    glass: ['#6fbfc0', '#255f6c'], // pane: top, bottom
    overcast: 'rgba(60,50,70,0.5)', // rain only
    rainCloud: ['rgba(50,40,60,0.9)', 'rgba(120,80,80,0.85)'],
  },
  day: {
    bloom: 0.2,
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
    ground: {
      desert: { body: ['#e2a66c', '#b8743f', '#8a5030'], lip: '#f6cf98' },
      jungle: { body: ['#8ea47a', '#5f7050', '#3d4a36'], lip: '#a8d76a' },
      nautic: { body: ['#7d8d94', '#4e5c63', '#303a40'], lip: '#d6eef2' },
      belt: { body: ['#b0a294', '#7e7066', '#4e443e'], lip: '#ece0d0' },
    },
    wood: ['#d8a266', '#a86f3c', '#6e4524'],
    stone: ['#b9b3a0', '#8f8a78', '#5f5b4e'],
    concrete: ['#dcd6cc', '#aaa49b', '#78726b'],
    metal: GUNMETAL,
    panel: ['#fff8e6', '#efe4c8', '#c9bb9a'],
    glass: ['#8fe0da', '#2f8f96'],
    overcast: 'rgba(120,128,140,0.6)',
    rainCloud: ['rgba(150,155,165,0.9)', 'rgba(110,115,128,0.9)'],
  },
  night: {
    bloom: 0.6,
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
    ground: {
      desert: { body: ['#6a6488', '#47405e', '#2a2540'], lip: '#a6a8d8' },
      jungle: { body: ['#4c5a62', '#333f44', '#1e262a'], lip: '#5f8a6a' },
      nautic: { body: ['#4a5668', '#2f3846', '#1a2029'], lip: '#9fb8d0' },
      belt: { body: ['#626078', '#424054', '#262534'], lip: '#a8a8cc' },
    },
    wood: ['#6a5a74', '#473a50', '#2a2232'],
    stone: ['#5b6178', '#3e4357', '#242838'],
    concrete: ['#62657f', '#42445c', '#262738'],
    metal: ['#525869', '#303441', '#161821'],
    panel: ['#9aa0c8', '#6b6f99', '#3f4166'],
    glass: ['#3f8690', '#143a44'],
    overcast: 'rgba(12,14,24,0.55)',
    rainCloud: ['rgba(20,22,34,0.95)', 'rgba(40,44,62,0.9)'],
  },
} as const

// Deep space: no air, so no clouds or haze. planets: bodies in the sky; nebula: soft glows behind the stars.
const SPACE = {
  ...EARTH.night,
  sky: [[0, '#020208'], [0.6, '#06061a'], [1, '#0e0a22']],
  starDepth: 1, // stars all the way down, there's no horizon
  suns: [{ x: 0.08, y: 0.1, r: 7 }], // upper left, where all the art is lit from
  sun: '#fffbe8',
  sunGlow: '#ffd890',
  glow: 0.55,
  planets: [
    { kind: 'giant', x: 0.3, y: 0.32, r: 150, bands: ['#e8c9a0', '#c28a5c', '#f2dcb8', '#a8643e', '#e0b98c', '#8a5236'], spot: '#c25a3a' },
    { kind: 'moon', x: 0.52, y: 0.16, r: 16, color: '#c8c2b8' },
  ],
  nebula: ['rgba(120,60,190,0.5)', 'rgba(40,110,200,0.45)', 'rgba(210,70,130,0.35)'],
  cloud: null,
  mesas: ['#16141d', '#1d1a25', '#25212e', '#2e2937'], // distant rocks, far → near
  windows: 0,
  haze: ['rgba(0,0,0,0)', 'rgba(0,0,0,0)'],
  ground: { ...EARTH.night.ground, belt: { body: ['#f0e2d2', '#a8968a', '#4a3c3a'], lip: '#e8c09c' } },
  metal: GUNMETAL,
  panel: ['#fff8e6', '#efe4c8', '#c9bb9a'],
  concrete: ['#c8c6c2', '#96948f', '#64625e'],
  glass: ['#8fe0da', '#2f8f96'],
} as const

export const SKIES = { ...EARTH, space: SPACE } as const satisfies Record<string, Record<string, unknown> & {
  bloom: number
  ground: Record<Biome, GroundColors>
  wood: Palette
  stone: Palette
  concrete: Palette
  metal: Palette
  panel: Palette
}>

type SpaceOnly = Pick<typeof SPACE, 'starDepth' | 'planets' | 'nebula'>
export type Time = keyof typeof SKIES
export type Sky = (typeof SKIES)[Time] & Partial<SpaceOnly>
export type Planet = (typeof SPACE)['planets'][number]

export const RAIN = {
  drop: 'rgba(200,215,235,0.35)',
  splash: 'rgba(220,230,245,0.5)',
  lightning: 'rgba(230,235,255,0.55)',
}

export const FONT = 'Futura, "Avenir Next", "Century Gothic", "Segoe UI", system-ui, sans-serif'
