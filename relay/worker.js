// The Atlas relay: lets the website (which runs the service in the visitor's browser) reach the Atlas
// API, which does not answer web pages directly. It passes /api/v1/* through to Atlas with the
// visitor's own key and adds the CORS headers; it keeps nothing and logs nothing.
const ATLAS = 'https://api.mothquantum.com'
const ORIGINS = [/^https:\/\/wedgeglobal\.github\.io$/, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/]

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') ?? ''
    const allowed = ORIGINS.some((re) => re.test(origin))
    const cors = allowed
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') ?? 'Authorization, Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        }
      : {}
    const url = new URL(request.url)
    if (!allowed) return new Response('Not allowed from this origin.', { status: 403 })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (!url.pathname.startsWith('/api/v1/')) return new Response('Not found.', { status: 404, headers: cors })

    const headers = new Headers()
    for (const h of ['Authorization', 'Content-Type', 'Accept']) {
      const v = request.headers.get(h)
      if (v) headers.set(h, v)
    }
    const upstream = await fetch(ATLAS + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    })
    const out = new Headers(upstream.headers)
    for (const [k, v] of Object.entries(cors)) out.set(k, v)
    return new Response(upstream.body, { status: upstream.status, headers: out })
  },
}
