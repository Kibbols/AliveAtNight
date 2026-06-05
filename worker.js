// AliveAtNight Wiki Proxy Worker
// Proxies requests to deadbydaylight.fandom.com to bypass CORS

const WIKI_API_BASE  = 'https://deadbydaylight.wiki.gg/api.php';
const WIKI_HTML_BASE = 'https://deadbydaylight.wiki.gg/wiki/';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const TWITCH_CLIENT_ID = 'u2guup4sc83lg6e9iujj8r4lozuzhk';
const TWITCH_REDIRECT_URI = 'https://kibbols.github.io/AliveAtNight/twitch-callback.html';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...CORS_HEADERS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
    }
    const isTwitchPost = request.method === 'POST' && new URL(request.url).searchParams.get('twitch');
    if (request.method !== 'GET' && !isTwitchPost) {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    try {
      const incoming = new URL(request.url);
      const params = incoming.searchParams;

      // If ?parse=1&page=PageName, fetch article HTML via parse API (cleaner than full page)
      if (params.get('parse') === '1') {
        const page = params.get('page');
        if (!page) return new Response(JSON.stringify({ error: 'Missing page param' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
        const wikiUrl = `${WIKI_API_BASE}?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json`;
        const res = await fetch(wikiUrl, {
          headers: { 'User-Agent': 'AliveAtNight/1.0 (https://kibbols.github.io/AliveAtNight)', 'Accept': 'application/json' },
          cf: { cacheTtl: 3600, cacheEverything: true }
        });
        if (!res.ok) return new Response(JSON.stringify({ error: `Wiki returned ${res.status}` }), { status: res.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
        const data = await res.json();
        const html = data?.parse?.text?.['*'] || '';
        return new Response(html, { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' } });
      }

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

      // POST ?twitch=token — exchange auth code for access token
      if (params.get('twitch') === 'token' && request.method === 'POST') {
        const body = await request.json();
        const res = await fetch('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: TWITCH_CLIENT_ID,
            client_secret: env.TWITCH_CLIENT_SECRET,
            code: body.code,
            grant_type: 'authorization_code',
            redirect_uri: TWITCH_REDIRECT_URI,
          })
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), { status: res.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      // POST ?twitch=poll — create a Twitch poll
      if (params.get('twitch') === 'poll' && request.method === 'POST') {
        const body = await request.json();
        const res = await fetch('https://api.twitch.tv/helix/polls', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${body.access_token}`,
            'Client-Id': TWITCH_CLIENT_ID,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            broadcaster_id: body.broadcaster_id,
            title: body.title,
            choices: body.choices.map(c => ({ title: c })),
            duration: body.duration || 60,
          })
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), { status: res.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      // GET ?twitch=user — get user info from token
      if (params.get('twitch') === 'user') {
        const token = params.get('token');
        const res = await fetch('https://api.twitch.tv/helix/users', {
          headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID }
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), { status: res.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
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
