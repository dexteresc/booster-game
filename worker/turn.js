// Cloudflare Worker: hands the game short-lived TURN credentials, so the TURN
// key's secret never reaches the browser. GET / → { iceServers: [...] }.
// Deploy steps are in wrangler.toml.
//
// env.TURN_KEY_ID: TURN key id (var). env.TURN_KEY_API_TOKEN: its API token (secret).
// env.ALLOWED_ORIGINS: comma-separated pages allowed to ask (var).

const TTL_SECONDS = 24 * 60 * 60 // a host keeps its credentials for the whole session

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin')
    if (!env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).includes(origin)) {
      return new Response(`Origin ${origin} not allowed`, { status: 403 })
    }
    const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } })
    if (request.method !== 'GET') return new Response(`${request.method} not allowed`, { status: 405, headers: cors })

    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.error(`Cloudflare TURN credentials failed: ${res.status} ${detail}`)
      return new Response(`TURN credentials failed: ${res.status}`, { status: 502, headers: cors })
    }
    return new Response(await res.text(), { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  },
}
