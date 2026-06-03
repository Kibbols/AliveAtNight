// AliveAtNight Wiki Proxy Worker
// Proxies requests to deadbydaylight.fandom.com to bypass CORS

const WIKI_API_BASE  = 'https://deadbydaylight.wiki.gg/api.php';
const WIKI_HTML_BASE = 'https://deadbydaylight.wiki.gg/wiki/';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    try {
      const incoming = new URL(request.url);
      const params = incoming.searchParams;

      // If ?html=1&page=PageName, fetch rendered HTML from the wiki
      if (params.get('html') === '1') {
        const page = params.get('page');
        if (!page) return new Response(JSON.stringify({ error: 'Missing page param' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

        const wikiUrl = `${WIKI_HTML_BASE}${encodeURIComponent(page)}`;
        const res = await fetch(wikiUrl, {
          headers: {
            'User-Agent': 'AliveAtNight/1.0 (https://kibbols.github.io/AliveAtNight)',
            'Accept': 'text/html',
          },
          cf: { cacheTtl: 3600, cacheEverything: true }
        });

        if (!res.ok) return new Response(JSON.stringify({ error: `Wiki returned ${res.status}` }), { status: res.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

        const html = await res.text();
        return new Response(html, {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' }
        });
      }

      // Otherwise proxy the API call
      const wikiParams = new URLSearchParams(params);
      wikiParams.set('format', 'json');
      wikiParams.delete('origin');

      const wikiUrl = `${WIKI_API_BASE}?${wikiParams.toString()}`;
      const res = await fetch(wikiUrl, {
        headers: {
          'User-Agent': 'AliveAtNight/1.0 (https://kibbols.github.io/AliveAtNight)',
          'Accept': 'application/json',
        },
        cf: { cacheTtl: 3600, cacheEverything: true }
      });

      if (!res.ok) return new Response(JSON.stringify({ error: `Wiki returned ${res.status}` }), { status: res.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

      return new Response(await res.text(), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
  }
};
