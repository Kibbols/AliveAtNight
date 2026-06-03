// AliveAtNight Wiki Proxy Worker
// Deploys to Cloudflare Workers — proxies requests to deadbydaylight.fandom.com
// to bypass CORS restrictions from the browser.
//
// Setup:
//   1. Create a Worker at dash.cloudflare.com named "aliveatnight-proxy"
//   2. Paste this file's contents into the editor and Deploy
//   3. Copy your worker URL (e.g. https://aliveatnight-proxy.YOUR.workers.dev)
//   4. Set WORKER_URL in app.js to that URL

const WIKI_BASE = 'https://deadbydaylight.fandom.com/api.php';
const ALLOWED_ORIGIN = '*'; // lock this down to your github pages URL if desired

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    try {
      const incoming = new URL(request.url);
      
      // Build the wiki API URL from the incoming query params
      const wikiParams = new URLSearchParams(incoming.search);
      wikiParams.set('format', 'json');
      // Remove origin param — we handle CORS ourselves
      wikiParams.delete('origin');

      const wikiURL = `${WIKI_BASE}?${wikiParams.toString()}`;

      const wikiResponse = await fetch(wikiURL, {
        headers: {
          'User-Agent': 'AliveAtNight/1.0 (https://kibbols.github.io/AliveAtNight)',
          'Accept': 'application/json',
        },
        cf: {
          // Cache wiki responses for 1 hour
          cacheTtl: 3600,
          cacheEverything: true,
        }
      });

      if (!wikiResponse.ok) {
        return new Response(
          JSON.stringify({ error: `Wiki returned ${wikiResponse.status}` }),
          { status: wikiResponse.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const data = await wikiResponse.text();

      return new Response(data, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        }
      });

    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  }
};
