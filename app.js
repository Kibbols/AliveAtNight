'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const API_KEY_STORAGE    = 'dbd_gemini_api_key';
const GITHUB_PAT_STORAGE = 'dbd_github_pat';
const FEEDME_STORAGE     = 'dbd_feedme_data';
const WORKER_URL         = 'https://aliveatnight-proxy.portgamingsttv.workers.dev';
const GITHUB_REPO        = 'Kibbols/AliveAtNight';
const GITHUB_FILE        = 'FEEDME';

// ── State ─────────────────────────────────────────────────────────────────────
let apiKey    = localStorage.getItem(API_KEY_STORAGE)    || '';
let githubPAT = localStorage.getItem(GITHUB_PAT_STORAGE) || '';
let activeKillers = [];

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

// ── Init: load FEEDME ─────────────────────────────────────────────────────────
(async function init() {
  if (githubPAT) patInput.value = '••••••••••••••••';

  // Try repo FEEDME file first
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

  // Try localStorage cache
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

  // No data yet — show empty state
  populateKillerSelect([], 'empty');
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
  syncStartBtn.style.display = '';
  syncModal.classList.add('open');
});
syncCancelBtn.addEventListener('click', () => syncModal.classList.remove('open'));
syncModal.addEventListener('click', e => { if (e.target === syncModal) syncModal.classList.remove('open'); });
syncStartBtn.addEventListener('click', runSync);

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

// ── Main Sync ─────────────────────────────────────────────────────────────────
async function runSync() {
  const pat = githubPAT;
  if (!pat) { logSync('✗ No GitHub PAT set.', 'err'); return; }

  syncStartBtn.disabled = true;
  syncStatus.innerHTML = '';

  try {
    // Step 1: fetch killer list from wiki categories
    logSync('Fetching killer list…', 'working');
    const killerNames = await fetchKillerList();
    logSync(`✓ Found ${killerNames.length} killers`, 'ok');

    // Step 2: fetch Module:Datatable for power names + killer IDs
    logSync('Fetching killer metadata…', 'working');
    const killerMeta = await fetchKillerMeta();
    logSync(`✓ Metadata for ${Object.keys(killerMeta).length} killers`, 'ok');

    // Step 3: fetch Module:Datatable/Loadout for all addon data
    logSync('Fetching add-on data…', 'working');
    const allAddons = await fetchAllAddons();
    logSync(`✓ ${allAddons.length} add-ons loaded`, 'ok');

    // Step 4: for each killer, fetch power description from character page
    const results = [];
    for (const killerTitle of killerNames) {
      logSync(`Parsing: ${killerTitle}…`, 'working');
      const meta = killerMeta[firstTwo(killerTitle)];
      const power = meta?.power || '';
      const killerId = meta?.id;
      const charPage = meta?.charPage;

      // Get addons for this killer by ID
      const addons = killerId
        ? allAddons.filter(a => a.killerId === String(killerId))
        : [];

      // Fetch power description from character page
      let powerDesc = '';
      if (charPage) {
        try {
          powerDesc = await fetchPowerDesc(charPage, power);
        } catch (_) {}
      }

      results.push({ name: killerTitle, power, powerDesc, addons });
      logSync(`  ✓ ${addons.length} add-ons`, 'ok');
    }

    // Step 5: save and push
    const compact = JSON.stringify(results);
    localStorage.setItem(FEEDME_STORAGE, compact);
    activeKillers = results;
    populateKillerSelect(activeKillers, 'wiki');

    logSync('Pushing FEEDME to GitHub…', 'working');
    await pushFeedmeToGithub(compact, pat);
    logSync('✓ FEEDME committed to repo!', 'ok');

    logSync('✓ Sync complete!', 'ok');
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

// ── Wiki API ──────────────────────────────────────────────────────────────────
async function wikiGet(params) {
  const url = new URL(WORKER_URL);
  url.search = new URLSearchParams({ ...params, format: 'json' }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
  return res.json();
}

async function wikiGetHTML(page) {
  const url = new URL(WORKER_URL);
  url.searchParams.set('html', '1');
  url.searchParams.set('page', page);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
  return res.text();
}

async function wikiGetModule(title) {
  const data = await wikiGet({
    action: 'query',
    prop: 'revisions',
    titles: title,
    rvprop: 'content',
    rvslots: 'main'
  });
  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];
  return page?.revisions?.[0]?.slots?.main?.['*']
    || page?.revisions?.[0]?.['*'] || '';
}

function firstTwo(name) {
  return name.split(' ').slice(0, 2).join(' ').toLowerCase();
}

// ── Fetch killer list from wiki categories ────────────────────────────────────
async function fetchKillerList() {
  const subcategories = ['Category:Easy_Killers', 'Category:Moderate_Killers', 'Category:Hard_Killers', 'Category:Very_Hard_Killers'];
  const names = new Set();
  for (const cat of subcategories) {
    try {
      const data = await wikiGet({ action: 'query', list: 'categorymembers', cmtitle: cat, cmlimit: '100', cmnamespace: '0' });
      (data?.query?.categorymembers || []).forEach(m => names.add(m.title));
    } catch (_) {}
  }
  return [...names].sort();
}

// ── Fetch killer metadata from Module:Datatable ───────────────────────────────
// Returns map of firstTwo(killerTitle) -> { id, power, charPage }
async function fetchKillerMeta() {
  const lua = await wikiGetModule('Module:Datatable');
  const meta = {};

  // Match killer entries: {id=N, name="X", realName="Y", power="Z", ...}
  const entryRe = /\{[^{}]*id\s*=\s*(\d+)[^{}]*\}/gs;
  let m;
  while ((m = entryRe.exec(lua)) !== null) {
    const entry = m[0];
    const powerM = entry.match(/power\s*=\s*"([^"]+)"/);
    if (!powerM) continue; // not a killer entry
    const nameM  = entry.match(/\bname\s*=\s*"([^"]+)"/);
    const realM  = entry.match(/realName\s*=\s*"([^"]+)"/);
    const idM    = entry.match(/\bid\s*=\s*(\d+)/);
    if (!nameM || !idM) continue;

    const killerTitle = 'The ' + nameM[1];
    const realName    = realM ? realM[1] : nameM[1];
    const charPage    = realName.replace(/ /g, '_');

    meta[firstTwo(killerTitle)] = {
      id:       parseInt(idM[1]),
      power:    powerM[1],
      charPage
    };
  }
  return meta;
}

// ── Fetch all addons from Module:Datatable/Loadout ────────────────────────────
// Returns array of { name, killerId, desc }
async function fetchAllAddons() {
  const lua = await wikiGetModule('Module:Datatable/Loadout');
  const addons = [];

  // Format: ["Addon Name"] = {id=N, rarity=N, killer=N, effect="...", ...}
  const addonRe = /\["([^"]+)"\]\s*=\s*\{([^}]+)\}/g;
  let m;
  while ((m = addonRe.exec(lua)) !== null) {
    const name  = m[1];
    const props = m[2];
    const killerM = /\bkiller\s*=\s*(\d+)/.exec(props);
    if (!killerM) continue;
    const effectM = /\beffect\s*=\s*"([^"]*)"/.exec(props);
    const desc = effectM ? effectM[1] : '';
    addons.push({ name, killerId: killerM[1], desc });
  }
  return addons;
}

// ── Fetch power description from character page HTML ──────────────────────────
async function fetchPowerDesc(charPage, powerName) {
  const html = await wikiGetHTML(charPage);
  if (!html || html.length < 100) return '';

  // Find the Power section and extract text before the addon table
  const idSearchStr = 'id="Power"';
  const powerPos = html.indexOf(idSearchStr);
  if (powerPos < 0) return '';

  const addonPos = html.indexOf('id="Add-ons_for_', powerPos);
  const chunk = addonPos > 0 ? html.slice(powerPos, addonPos) : html.slice(powerPos, powerPos + 8000);

  return chunk
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
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

  let sha = null;
  try {
    const check = await fetch(apiBase, { headers });
    if (check.ok) sha = (await check.json()).sha;
  } catch (_) {}

  const res = await fetch(apiBase, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `chore: sync FEEDME from wiki [${new Date().toISOString().slice(0, 10)}]`,
      content: btoa(unescape(encodeURIComponent(content))),
      ...(sha ? { sha } : {})
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API HTTP ${res.status}`);
  }
}

// ── Lock Overlay ──────────────────────────────────────────────────────────────
function showLockAndRefresh() {
  if (!lockOverlay) { setTimeout(() => window.location.reload(), 120000); return; }
  lockOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  let seconds = 120;
  function tick() {
    const m = Math.floor(seconds / 60), s = seconds % 60;
    if (lockCountdown) lockCountdown.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    if (seconds <= 0) { if (lockStatus) lockStatus.textContent = 'Refreshing…'; window.location.reload(); return; }
    seconds--;
    setTimeout(tick, 1000);
  }
  tick();
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
  badge.textContent = source === 'wiki'   ? '● Live wiki data'
    : source === 'cache'  ? '● Cached wiki data'
    : source === 'empty'  ? '○ No data — run Sync to populate'
    : '○ No data';
  killerSelect.closest('.form-group').appendChild(badge);
}

function updatePowerPreview() {
  const idx = killerSelect.value;
  if (idx === '' || idx === null) { killerPowerPreview.innerHTML = ''; return; }
  const k = activeKillers[parseInt(idx)];
  let html = '';
  if (k.power) html += `<span class="power-name">⚡ ${k.power}:</span>${k.powerDesc}`;
  if (k.addons && k.addons.length > 0) {
    const names = k.addons.map(a => typeof a === 'object' ? a.name : a).join(', ');
    html += `<div style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-dim)">Add-ons: ${names}</div>`;
  }
  killerPowerPreview.innerHTML = html;
}

killerSelect.addEventListener('change', updatePowerPreview);

surpriseMe.addEventListener('change', () => {
  killerPrompt.disabled = surpriseMe.checked;
  killerPromptGroup.style.opacity = surpriseMe.checked ? '0.4' : '1';
});

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
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, maxOutputTokens: 2048 } })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${err?.error?.message || `HTTP ${res.status}`}`);
  }
  return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
}

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
  const fullPrompt = `You are a creative YouTube content strategist who specializes in Dead by Daylight (DbD) gaming content.\n\nThe user wants YouTube video ideas for survivor gameplay content based on the following request:\n"${prompt}"\n\nGenerate 4-6 distinct YouTube video concepts. For each concept, provide:\n1. A compelling, click-worthy YouTube video title\n2. A brief description of what the video would cover (2-4 sentences)\n3. Why this would perform well on YouTube for the DbD community\n\nMake titles punchy and engaging — the kind that get clicks in the DbD community.`;
  try {
    renderMarkdown(survivorResults, await callGemini(fullPrompt));
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
      if (typeof a === 'object' && a.name) return a.desc ? `- **${a.name}**: ${a.desc}` : `- ${a.name}`;
      return `- ${a}`;
    }).join('\n');
    addonContext = `\n**${killer.name}'s add-ons (use ONLY these, no others):**\n${addonList}`;
  }

  const intent = isSurprise
    ? 'Come up with genuinely creative, fun, and interesting builds that would make for entertaining YouTube content. Think outside the meta — find synergies, meme potential, unique playstyles, or high-skill-expression builds that viewers would find exciting to watch.'
    : `The user wants: "${buildRequest}"`;

  const fullPrompt = `You are a Dead by Daylight build theorist and YouTube content strategist with deep mechanical knowledge of the game.\n\n**Killer:** ${killer.name}\n**Killer Power — ${killer.power}:** ${killer.powerDesc}${addonContext}\n\n**Critical mechanical rules:**\n- Killer power hits are SPECIAL ATTACKS, not basic attacks. Perks that require "basic attacks" do NOT synergize with power hits unless the perk explicitly says "any attack" or "special attacks".\n- Reason from what each perk DOES mechanically, not its name or flavor text.\n- Only recommend add-ons from the list provided above. Do not invent or substitute add-on names.\n\n${intent}\n\nGenerate 3 distinct perk + add-on builds for ${killer.name}. For each build:\n1. Give the build a catchy name/title (suitable as a YouTube video title)\n2. List exactly 4 perks — for each, briefly explain what it does mechanically and why it fits\n3. List 2 add-ons from the provided list — explain the mechanical effect and why it fits\n4. Write a short "video pitch" (2-3 sentences) — why would viewers want to watch this?\n5. Rate: Difficulty (Beginner/Intermediate/Advanced), Fun Factor (1-5 🔪), Meme Potential (Low/Medium/High)`;

  try {
    renderMarkdown(killerResults, await callGemini(fullPrompt));
  } catch (err) {
    setError(killerResults, err.message);
  } finally {
    killerGenBtn.disabled = false;
  }
});
