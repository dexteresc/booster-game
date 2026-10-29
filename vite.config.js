import { readFile, readdir, writeFile } from 'node:fs/promises'
import { defineConfig } from 'vite'
import { parseMap } from './src/maps/parse.js'

const MAPS_DIR = new URL('./src/maps/', import.meta.url)
const NAME = /^[a-z0-9-]{1,40}$/
const MAX_BODY = 1_000_000

export default defineConfig({
  plugins: [mapFiles()],
})

// Dev server only: lets /editor.html read and write src/maps/*.json.
// GET /__maps → { name: map }. PUT /__maps/<name> with the map as JSON body.
function mapFiles() {
  return {
    name: 'map-files',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__maps', (req, res) => {
        handle(req)
          .then((body) => send(res, 200, body))
          .catch((err) => {
            console.error(`[map-files] ${req.method} /__maps${req.url} failed:`, err.message)
            send(res, err.status ?? 500, { error: err.message })
          })
      })
    },
  }
}

async function handle(req) {
  if (req.method === 'GET' && req.url === '/') return readMaps()
  const name = decodeURIComponent(req.url.slice(1))
  if (req.method !== 'PUT') throw httpError(405, `${req.method} not supported`)
  if (!NAME.test(name)) throw httpError(400, `Map name "${name}" must be 1-40 chars of a-z, 0-9, -`)
  let map
  try {
    map = parseMap(JSON.parse(await readBody(req)), name)
  } catch (err) {
    throw httpError(400, err.message)
  }
  await writeFile(new URL(`${name}.json`, MAPS_DIR), formatMap(map))
  return { saved: name }
}

async function readMaps() {
  const names = (await readdir(MAPS_DIR)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  const entries = await Promise.all(names.map(async (name) => [name, JSON.parse(await readFile(new URL(`${name}.json`, MAPS_DIR), 'utf8'))]))
  return Object.fromEntries(entries)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > MAX_BODY) reject(httpError(413, `Map body over ${MAX_BODY} bytes`))
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

// Pretty JSON, but each rect / cannon on one line so diffs stay readable.
function formatMap(map) {
  return JSON.stringify(map, null, 2).replace(/\{[^{}[\]]*\}/g, (obj) => JSON.stringify(JSON.parse(obj))) + '\n'
}

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}
