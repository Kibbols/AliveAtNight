'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const API_KEY_STORAGE    = 'dbd_gemini_api_key';
const GITHUB_PAT_STORAGE = 'dbd_github_pat';
const FEEDME_STORAGE     = 'dbd_feedme_data';
const WORKER_URL = 'https://aliveatnight-proxy.portgamingsttv.workers.dev';
const WIKI_API   = 'https://deadbydaylight.fandom.com/api.php'; // fallback reference only
const GITHUB_REPO        = 'Kibbols/AliveAtNight';
const GITHUB_FILE        = 'FEEDME';

// ── State ─────────────────────────────────────────────────────────────────────
let apiKey    = localStorage.getItem(API_KEY_STORAGE)    || '';
let githubPAT = localStorage.getItem(GITHUB_PAT_STORAGE) || '';
let activeKillers = window.DBD_KILLERS;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const apiModal        = document.getElementById('apiModal');
const apiToggleBtn    = document.getElementById('apiToggleBtn');
const apiKeyInput     = document.getElementById('apiKeyInput');
const apiSaveBtn      = document.getElementById('apiSaveBtn');
const apiCancelBtn    = document.getElementById('apiCancelBtn');
const noKeyBanner     = document.getElementById('noKeyBanner');
const setKeyBannerBtn = document.getElementById('setKeyBannerBtn');

const syncBtn       = document.getElementById('syncBtn');
const syncModal     = document.getElementById('syncModal');
const syncStatus    = document.getElementById('syncStatus');
const syncCancelBtn = document.getElementById('syncCancelBtn');
const syncStartBtn  = document.getElementById('syncStartBtn');
const patInput      = document.getElementById('patInput');

const lockOverlay   = document.getElementById('lockOverlay');
const lockStatus    = document.getElementById('lockStatus');
const lockCountdown = document.getElementById('lockCountdown');

const tabs        = document.querySelectorAll('.tab');
const panels      = document.querySelectorAll('.panel');

const killerSelect       = document.getElementById('killerSelect');
const killerPowerPreview = document.getElementById('killerPowerPreview');
const surpriseMe         = document.getElementById('surpriseMe');
const killerPromptGroup  = document.getElementById('killerPromptGroup');
const killerPrompt       = document.getElementById('killerPrompt');

const survivorPrompt  = document.getElementById('survivorPrompt');
const survivorGenBtn  = document.getElementById('survivorGenBtn');
const survivorResults = document.getElementById('survivorResults');

const killerGenBtn  = document.getElementById('killerGenBtn');
const killerResults = document.getElementById('killerResults');

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  if (githubPAT) patInput.value = '••••••••••••••••';

  try {
    const res = await fetch('FEEDME');
    if (res.ok) {
      const data = JSON.parse(await res.text());
      if (Array.isArray(data) && data.length > 0) {
        activeKillers = data;
        populateKillerSelect(activeKillers, 'wiki');
        checkKeyBanner();
        return;
      }
    }
  } catch (_) {}

  try {
    const stored = localStorage.getItem(FEEDME_STORAGE);
    if (stored) {
      const data = JSON.parse(stored);
      if (Array.isArray(data) && data.length > 0) {
        activeKillers = data;
        populateKillerSelect(activeKillers, 'cache');
        checkKeyBanner();
        return;
      }
    }
  } catch (_) {}

  populateKillerSelect(activeKillers, 'fallback');
  checkKeyBanner();
})();

// ── API Key Modal ─────────────────────────────────────────────────────────────
function openApiModal() {
  apiKeyInput.value = apiKey;
  apiModal.classList.add('open');
  setTimeout(() => apiKeyInput.focus(), 50);
}
function closeApiModal() { apiModal.classList.remove('open'); }
function saveApiKey() {
  const val = apiKeyInput.value.trim();
  if (val) {
    apiKey = val;
    localStorage.setItem(API_KEY_STORAGE, val);
  }
  checkKeyBanner();
  closeApiModal();
}
function checkKeyBanner() {
  noKeyBanner.classList.toggle('visible', !apiKey);
}

apiToggleBtn.addEventListener('click', openApiModal);
apiSaveBtn.addEventListener('click', saveApiKey);
apiCancelBtn.addEventListener('click', closeApiModal);
setKeyBannerBtn.addEventListener('click', openApiModal);
apiModal.addEventListener('click', e => { if (e.target === apiModal) closeApiModal(); });
apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveApiKey(); });

// ── Sync Modal ────────────────────────────────────────────────────────────────
syncBtn.addEventListener('click', () => {
  syncStatus.innerHTML = '';
  syncStartBtn.disabled = false;
  syncStartBtn.textContent = '⟳ Start Sync';
  syncModal.classList.add('open');
});
syncCancelBtn.addEventListener('click', () => syncModal.classList.remove('open'));
syncModal.addEventListener('click', e => { if (e.target === syncModal) syncModal.classList.remove('open'); });
syncStartBtn.addEventListener('click', runSync);

// Save PAT when changed
patInput.addEventListener('change', () => {
  const val = patInput.value.trim();
  if (val && !val.startsWith('•')) {
    githubPAT = val;
    localStorage.setItem(GITHUB_PAT_STORAGE, val);
    patInput.value = '••••••••••••••••';
  }
});

function logSync(msg, cls = '') {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  syncStatus.appendChild(line);
  syncStatus.scrollTop = syncStatus.scrollHeight;
}

async function runSync() {
  const pat = githubPAT;
  if (!pat) {
    logSync('✗ No GitHub PAT set — enter it above.', 'err');
    return;
  }

  syncStartBtn.disabled = true;
  syncStatus.innerHTML = '';

  try {
    logSync('Fetching killer list from wiki…', 'working');
    const killerNames = await fetchKillerList();
    logSync(`✓ Found ${killerNames.length} killers`, 'ok');

    const results = [];
    for (const name of killerNames) {
      logSync(`Parsing: ${name}…`, 'working');

      // Match fallback power data using first-two-words comparison
      const fallback = window.DBD_KILLERS.find(k => firstTwo(k.name) === firstTwo(name))
        || { power: '', powerDesc: '' };

      if (!fallback.power) {
        logSync(`  ⚠ No power data for ${name}`, 'err');
      }

      try {
        const result = await fetchKillerAddons(name, fallback.power);
        const addons = result.addons || [];
        const powerDesc = result.powerDesc || fallback.powerDesc || '';
        results.push({ name, power: fallback.power, powerDesc, addons });
        logSync(`  ✓ ${addons.length} add-ons`, 'ok');
        if (addons.length > 0) logSync(`    e.g. ${addons[0].name || addons[0]}`, '');
      } catch (err) {
        logSync(`  ✗ Add-ons failed: ${err.message}`, 'err');
        results.push({ name, power: fallback.power, powerDesc: fallback.powerDesc || '', addons: [] });
      }
    }

    const compact = JSON.stringify(results);
    localStorage.setItem(FEEDME_STORAGE, compact);
    activeKillers = results;
    populateKillerSelect(activeKillers, 'wiki');

    logSync('Pushing FEEDME to GitHub…', 'working');
    await pushFeedmeToGithub(compact, pat);
    logSync('✓ FEEDME committed to repo!', 'ok');

    logSync('✓ Sync complete! Review above then click Push & Refresh.', 'ok');
    syncStartBtn.style.display = 'none';
    const pushBtn = document.createElement('button');
    pushBtn.className = 'btn-primary';
    pushBtn.textContent = '⬆ Push & Refresh';
    pushBtn.style.marginTop = '0.5rem';
    pushBtn.addEventListener('click', () => {
      syncModal.classList.remove('open');
      showLockAndRefresh();
    });
    syncStatus.appendChild(pushBtn);

  } catch (err) {
    logSync(`✗ Sync failed: ${err.message}`, 'err');
    syncStartBtn.disabled = false;
    syncStartBtn.textContent = '⟳ Retry';
  }
}

// ── GitHub Push ───────────────────────────────────────────────────────────────
async function pushFeedmeToGithub(content, pat) {
  const headers = {
    'Authorization': `Bearer ${pat}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };

  const apiBase = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  // Get current SHA if file exists (needed for update)
  let sha = null;
  try {
    const check = await fetch(apiBase, { headers });
    if (check.ok) {
      const data = await check.json();
      sha = data.sha;
    }
  } catch (_) {}

  const body = {
    message: `chore: sync FEEDME from wiki [${new Date().toISOString().slice(0,10)}]`,
    content: btoa(unescape(encodeURIComponent(content))),
    ...(sha ? { sha } : {})
  };

  const res = await fetch(apiBase, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API HTTP ${res.status}`);
  }
}

// ── Lock Overlay + Auto-refresh ───────────────────────────────────────────────
function showLockAndRefresh() {
  if (!lockOverlay) {
    // Fallback if overlay element missing for any reason
    setTimeout(() => window.location.reload(), 120000);
    return;
  }
  lockOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  let seconds = 120;

  function tick() {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (lockCountdown) lockCountdown.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    if (seconds <= 0) {
      if (lockStatus) lockStatus.textContent = 'Refreshing…';
      window.location.reload();
      return;
    }
    seconds--;
    setTimeout(tick, 1000);
  }
  tick();
}

// ── Wiki API helpers ──────────────────────────────────────────────────────────
async function wikiGet(params) {
  const url = new URL(WORKER_URL);
  url.search = new URLSearchParams({ ...params, format: 'json' }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Worker/Wiki HTTP ${res.status}`);
  return res.json();
}

// Static charPage + power map derived from Module:Datatable
// Used as the primary source for addon fetching
const KILLER_META = {
  'the trapper':        { charPage: 'Evan_MacMillan',              power: 'Bear Traps' },
  'the wraith':         { charPage: 'Philip_Ojomo',                power: 'Wailing Bell' },
  'the hillbilly':      { charPage: 'Max_Thompson_Jr.',            power: 'Chainsaw' },
  'the nurse':          { charPage: 'Sally_Smithson',              power: "Spencer's Last Breath" },
  'the shape':          { charPage: 'Michael_Myers',               power: 'Evil Within' },
  'the hag':            { charPage: 'Lisa_Sherwood',               power: 'Blackened Catalyst' },
  'the doctor':         { charPage: 'Herman_Carter',               power: "Carter's Spark" },
  'the huntress':       { charPage: 'Anna',                        power: 'Hunting Hatchets' },
  'the cannibal':       { charPage: 'Bubba_Sawyer',               power: "Bubba's Chainsaw" },
  'the nightmare':      { charPage: 'Freddy_Krueger',              power: 'Dream Demon' },
  'the pig':            { charPage: 'Amanda_Young',                power: "Jigsaw's Baptism" },
  'the clown':          { charPage: 'Kenneth_Chase_alias_Jeffrey_Hawk', power: 'The Afterpiece Tonic' },
  'the spirit':         { charPage: 'Rin_Yamaoka',                 power: "Yamaoka's Haunting" },
  'the legion':         { charPage: 'Frank,_Julie,_Susie,_Joey',   power: 'Feral Frenzy' },
  'the plague':         { charPage: 'Adiris',                      power: 'Vile Purge' },
  'the ghost':          { charPage: 'Danny_Johnson_alias_Jed_Olsen', power: 'Night Shroud' },
  'the demogorgon':     { charPage: 'The_Demogorgon',              power: 'Of The Abyss' },
  'the oni':            { charPage: 'Kazan_Yamaoka',               power: "Yamaoka's Wrath" },
  'the deathslinger':   { charPage: 'Caleb_Quinn',                 power: 'The Redeemer' },
  'the executioner':    { charPage: 'Pyramid_Head',                power: 'Rites of Judgment' },
  'the blight':         { charPage: 'Talbot_Grimes',               power: 'Blighted Corruption' },
  'the twins':          { charPage: 'Charlotte_&_Victor_Deshayes',   power: 'Blood Bond' },
  'the trickster':      { charPage: 'Ji-Woon_Hak',                 power: 'Showstopper' },
  'the nemesis':        { charPage: 'Nemesis_T-Type',              power: 'T-Virus' },
  'the cenobite':       { charPage: 'Elliot_Spencer',              power: 'Summons of Pain' },
  'the artist':         { charPage: 'Carmina_Mora',                power: 'Birds of Torment' },
  'the onryo':          { charPage: 'Sadako_Yamamura',             power: 'Deluge of Fear' },
  'the dredge':         { charPage: 'The_Dredge',                  power: 'Reign of Darkness' },
  'the mastermind':     { charPage: 'Albert_Wesker',               power: 'Uroboros Infection' },
  'the knight':         { charPage: 'The_Knight',                  power: 'Guardia Compagnia' },
  'the skull':          { charPage: 'Adriana_Imai',                power: 'Tri-Surveillance' },
  'the singularity':    { charPage: 'HUX-A7-13',                   power: 'Quantum Instantiation' },
  'the xenomorph':      { charPage: 'The_Xenomorph',               power: 'Crawl Tunnel' },
  'the good':           { charPage: 'Charles_Lee_Ray',             power: 'Hidey-Ho Mode' },
  'the unknown':        { charPage: 'The_Unknown',                 power: 'UVX' },
  'the lich':           { charPage: 'Vecna',                       power: 'Tome of Torment' },
  'the dark':           { charPage: 'Dracula',                     power: 'Crimson Dark' },
  'the houndmaster':    { charPage: 'Portia_Maye',                 power: 'The Hunt' },
  'the ghoul':          { charPage: 'Ken_Kaneki',                  power: 'One-Eyed Terror' },
  'the animatronic':    { charPage: 'William_Afton',               power: "Fazbear's Fright" },
  'the krasue':         { charPage: 'Burong_Sukapat',               power: 'Unbodied Flesh' },
  'the first':          { charPage: 'Vecna',                        power: 'Worldeater' },
};

async function fetchDatatable() {
  // Build meta from static map — no API call needed
  const killers = Object.entries(KILLER_META).map(([key, val]) => ({
    title: key.replace(/^the /, 'The '),
    ...val
  }));
  return killers;
}

async function fetchKillerList() {
  const datatableKillers = await fetchDatatable();

  // Build a lookup: first two words of title -> { charPage, power }
  window._wikiKillerMeta = {};
  for (const k of datatableKillers) {
    window._wikiKillerMeta[firstTwo(k.title)] = k;
  }

  // Return display names — use our fallback names where we have them,
  // falling back to wiki titles for any we don't know
  const allNames = new Set(window.DBD_KILLERS.map(k => k.name));
  for (const k of datatableKillers) {
    if (![...allNames].some(n => firstTwo(n) === firstTwo(k.title))) {
      allNames.add(k.title);
    }
  }
  return [...allNames].sort();
}

function firstTwo(name) {
  return name.split(' ').slice(0, 2).join(' ').toLowerCase();
}

async function fetchRenderedHTML(page) {
  const url = new URL(WORKER_URL);
  url.searchParams.set('html', '1');
  url.searchParams.set('page', page);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
  return res.text();
}

async function fetchKillerAddons(killerName, powerName) {
  const meta = KILLER_META[firstTwo(killerName)];
  if (!meta) throw new Error('No datatable entry for ' + killerName);

  const { charPage } = meta;

  const html = await fetchRenderedHTML(charPage);
  if (!html || html.length < 100) throw new Error('Empty HTML for ' + charPage);

  // Parse power description — section between == Power == and the addon table
  let powerDesc = '';
  const powerSectionMatch = html.match(/id="Power"[\s\S]*?<\/h2>([\s\S]*?)(?=<h[23][^>]*>[\s\S]*?Add-ons for|<h2)/i);
  if (powerSectionMatch) {
    powerDesc = powerSectionMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1000);
  }

  // Find the addon table — parse name + description from each row
  // Table structure: <tr> <td>icon</td> <td>name</td> <td>description</td> </tr>
  const addons = [];
  const addonSectionMatch = html.match(/Add-ons for[\s\S]*?(<table[\s\S]*?<\/table>)/i);

  if (addonSectionMatch) {
    const tableHtml = addonSectionMatch[1];
    // Extract all rows
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
      const row = rowMatch[1];
      // Get all <td> cells
      const cells = [];
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellRe.exec(row)) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      }
      // Row has 3 cells: icon, name, description
      if (cells.length >= 3) {
        const name = cells[1].trim();
        const desc = cells[2].trim();
        if (name.length >= 3 && name.length <= 60 && /^["A-Z']/.test(name)) {
          addons.push({ name, desc });
        }
      }
    }
  }

  return { addons: addons.slice(0, 20), powerDesc };
}



function parseAddonNames(wikitext) {
  const names = [];
  const patterns = [
    /\|\s*\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]/g,
    /^\|\s*([A-Z][^|{\n]{3,40}?)\s*\|/gm
  ];
  const seen = new Set();
  for (const re of patterns) {
    let m;
    while ((m = re.exec(wikitext)) !== null) {
      const name = m[1].trim();
      if (
        name.length > 2 &&
        name.length < 60 &&
        !name.startsWith('File:') &&
        !name.startsWith('Category:') &&
        !name.includes('=') &&
        !name.includes('\n') &&
        !seen.has(name)
      ) {
        seen.add(name);
        names.push(name);
      }
    }
  }
  return names.slice(0, 20);
}

// ── Killer Dropdown ───────────────────────────────────────────────────────────
function populateKillerSelect(killers, source) {
  killerSelect.innerHTML = '<option value="">— Select a Killer —</option>';
  killers.forEach((k, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = k.name;
    killerSelect.appendChild(opt);
  });

  const existing = document.getElementById('dataSourceBadge');
  if (existing) existing.remove();
  const badge = document.createElement('div');
  badge.id = 'dataSourceBadge';
  badge.className = 'data-source-badge' + (source === 'wiki' || source === 'cache' ? ' live' : '');
  badge.textContent = source === 'wiki'    ? '● Live wiki data'
    : source === 'cache'   ? '● Cached wiki data'
    : '○ Fallback data — use Sync to update';
  killerSelect.closest('.form-group').appendChild(badge);
}

function updatePowerPreview() {
  const idx = killerSelect.value;
  if (idx === '' || idx === null) { killerPowerPreview.innerHTML = ''; return; }
  const k = activeKillers[parseInt(idx)];
  let html = '';
  if (k.power) html += `<span class="power-name">⚡ ${k.power}:</span>${k.powerDesc}`;
  if (k.addons && k.addons.length > 0) {
    html += `<div style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-dim)">Add-ons: ${k.addons.join(', ')}</div>`;
  }
  killerPowerPreview.innerHTML = html;
}

killerSelect.addEventListener('change', updatePowerPreview);

// ── Surprise Me ───────────────────────────────────────────────────────────────
surpriseMe.addEventListener('change', () => {
  killerPrompt.disabled = surpriseMe.checked;
  killerPromptGroup.style.opacity = surpriseMe.checked ? '0.4' : '1';
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
  });
});

// ── Gemini API ────────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  if (!apiKey) throw new Error('No API key set. Click ⚙ API Key to add your Gemini key.');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 2048 }
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${err?.error?.message || `HTTP ${res.status}`}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function setLoading(container, msg = 'Thinking…') {
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>${msg}</span></div>`;
}
function setError(container, msg) {
  container.innerHTML = `<div class="error-state">⚠ ${msg}</div>`;
}
function renderMarkdown(container, text) {
  let html = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  html = html.replace(/^#{1,3} (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^[-•*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  html = html.replace(/(?<![>])\n(?!<)/g, '<br>');
  const div = document.createElement('div');
  div.className = 'raw-results';
  div.innerHTML = html;
  container.innerHTML = '';
  container.appendChild(div);
}

// ── Survivor Generation ───────────────────────────────────────────────────────
survivorGenBtn.addEventListener('click', async () => {
  const prompt = survivorPrompt.value.trim();
  if (!prompt) {
    survivorPrompt.focus();
    survivorPrompt.style.borderColor = 'var(--accent)';
    setTimeout(() => survivorPrompt.style.borderColor = '', 1500);
    return;
  }
  survivorGenBtn.disabled = true;
  setLoading(survivorResults, 'Generating survivor video ideas…');
  const fullPrompt = `You are a creative YouTube content strategist who specializes in Dead by Daylight (DbD) gaming content.

The user wants YouTube video ideas for survivor gameplay content based on the following request:
"${prompt}"

Generate 4-6 distinct YouTube video concepts. For each concept, provide:
1. A compelling, click-worthy YouTube video title
2. A brief description of what the video would cover (2-4 sentences)
3. Why this would perform well on YouTube for the DbD community

Make titles punchy and engaging — the kind that get clicks in the DbD community.`;
  try {
    const result = await callGemini(fullPrompt);
    renderMarkdown(survivorResults, result);
  } catch (err) {
    setError(survivorResults, err.message);
  } finally {
    survivorGenBtn.disabled = false;
  }
});

// ── Killer Generation ─────────────────────────────────────────────────────────
killerGenBtn.addEventListener('click', async () => {
  const idx = killerSelect.value;
  if (idx === '' || idx === null) { killerSelect.focus(); return; }

  const killer = activeKillers[parseInt(idx)];
  const isSurprise = surpriseMe.checked;
  const buildRequest = isSurprise ? null : killerPrompt.value.trim();

  if (!isSurprise && !buildRequest) {
    killerPrompt.focus();
    killerPrompt.style.borderColor = 'var(--accent)';
    setTimeout(() => killerPrompt.style.borderColor = '', 1500);
    return;
  }

  killerGenBtn.disabled = true;
  setLoading(killerResults, `Cooking up ${killer.name} builds…`);

  let addonContext = '\n**Note: No add-on list available — use your best knowledge of this killer\'s real add-ons only.**';
  if (killer.addons && killer.addons.length > 0) {
    const addonList = killer.addons.map(a => {
      if (typeof a === 'object' && a.name) {
        return a.desc ? `- **${a.name}**: ${a.desc}` : `- ${a.name}`;
      }
      return `- ${a}`;
    }).join('\n');
    addonContext = `\n**${killer.name}'s add-ons (use ONLY these, no others):**\n${addonList}`;
  }

  const intent = isSurprise
    ? 'Come up with genuinely creative, fun, and interesting builds that would make for entertaining YouTube content. Think outside the meta — find synergies, meme potential, unique playstyles, or high-skill-expression builds that viewers would find exciting to watch.'
    : `The user wants: "${buildRequest}"`;

  const fullPrompt = `You are a Dead by Daylight build theorist and YouTube content strategist with deep mechanical knowledge of the game.

**Killer:** ${killer.name}
**Killer Power — ${killer.power}:** ${killer.powerDesc}${addonContext}

**Critical mechanical rules:**
- Killer power hits are SPECIAL ATTACKS, not basic attacks. Perks that require "basic attacks" do NOT synergize with power hits unless the perk explicitly says "any attack" or "special attacks".
- Reason from what each perk DOES mechanically, not its name or flavor text.
- Only recommend add-ons from the list provided above. Do not invent or substitute add-on names.

${intent}

Generate 3 distinct perk + add-on builds for ${killer.name}. For each build:
1. Give the build a catchy name/title (suitable as a YouTube video title)
2. List exactly 4 perks — for each, briefly explain what it does mechanically and why it fits
3. List 2 add-ons from the provided list — explain the mechanical effect and why it fits
4. Write a short "video pitch" (2-3 sentences) — why would viewers want to watch this?
5. Rate: Difficulty (Beginner/Intermediate/Advanced), Fun Factor (1-5 🔪), Meme Potential (Low/Medium/High)`;

  try {
    const result = await callGemini(fullPrompt);
    renderMarkdown(killerResults, result);
  } catch (err) {
    setError(killerResults, err.message);
  } finally {
    killerGenBtn.disabled = false;
  }
});
