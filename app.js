'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const API_KEY_STORAGE  = 'dbd_gemini_api_key';
const FEEDME_STORAGE   = 'dbd_feedme_data';
const WIKI_API         = 'https://deadbydaylight.fandom.com/api.php';

// ── State ─────────────────────────────────────────────────────────────────────
let apiKey = localStorage.getItem(API_KEY_STORAGE) || '';
let activeKillers = window.DBD_KILLERS; // start with fallback

// ── DOM refs ──────────────────────────────────────────────────────────────────
const apiModal        = document.getElementById('apiModal');
const apiToggleBtn    = document.getElementById('apiToggleBtn');
const apiKeyInput     = document.getElementById('apiKeyInput');
const apiSaveBtn      = document.getElementById('apiSaveBtn');
const apiCancelBtn    = document.getElementById('apiCancelBtn');
const noKeyBanner     = document.getElementById('noKeyBanner');
const setKeyBannerBtn = document.getElementById('setKeyBannerBtn');

const syncBtn         = document.getElementById('syncBtn');
const syncModal       = document.getElementById('syncModal');
const syncStatus      = document.getElementById('syncStatus');
const syncCancelBtn   = document.getElementById('syncCancelBtn');
const syncStartBtn    = document.getElementById('syncStartBtn');

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

// ── Init: load FEEDME if available ────────────────────────────────────────────
(async function init() {
  // Try repo FEEDME file first
  try {
    const res = await fetch('FEEDME');
    if (res.ok) {
      const text = await res.text();
      const data = JSON.parse(text);
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

  // Fall back to hardcoded
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
    checkKeyBanner();
    closeApiModal();
  }
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

function logSync(msg, cls = '') {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  syncStatus.appendChild(line);
}

async function runSync() {
  syncStartBtn.disabled = true;
  syncStatus.innerHTML = '';

  try {
    // Step 1: fetch killer list from wiki category
    logSync('Fetching killer list from wiki…', 'working');
    const killerNames = await fetchKillerList();
    logSync(`✓ Found ${killerNames.length} killers`, 'ok');

    // Step 2: fetch add-ons for each killer
    const results = [];
    for (const name of killerNames) {
      logSync(`Fetching add-ons: ${name}…`, 'working');
      try {
        const addons = await fetchKillerAddons(name);
        // Find matching fallback entry for power description
        const fallback = window.DBD_KILLERS.find(k =>
          k.name.toLowerCase().includes(name.toLowerCase().replace('the ', '')) ||
          name.toLowerCase().includes(k.name.toLowerCase().replace('the ', ''))
        ) || { power: '', powerDesc: '' };

        results.push({
          name,
          power: fallback.power,
          powerDesc: fallback.powerDesc,
          addons
        });
        logSync(`  ✓ ${addons.length} add-ons`, 'ok');
      } catch (err) {
        logSync(`  ✗ Failed: ${err.message}`, 'err');
        // Push with no addons rather than skip
        const fallback = window.DBD_KILLERS.find(k =>
          k.name.toLowerCase().includes(name.toLowerCase().replace('the ', ''))
        ) || { power: '', powerDesc: '' };
        results.push({ name, power: fallback.power, powerDesc: fallback.powerDesc, addons: [] });
      }
    }

    // Step 3: save to localStorage
    const compact = JSON.stringify(results);
    localStorage.setItem(FEEDME_STORAGE, compact);
    activeKillers = results;
    populateKillerSelect(activeKillers, 'wiki');

    // Step 4: download FEEDME file
    logSync('Downloading FEEDME file…', 'working');
    const blob = new Blob([compact], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'FEEDME';
    a.click();
    URL.revokeObjectURL(url);

    logSync('✓ Done! Drop FEEDME in the repo root and push.', 'ok');
    syncStartBtn.textContent = '✓ Complete';

  } catch (err) {
    logSync(`✗ Sync failed: ${err.message}`, 'err');
    syncStartBtn.disabled = false;
    syncStartBtn.textContent = '⟳ Retry';
  }
}

// ── Wiki API helpers ──────────────────────────────────────────────────────────
async function wikiGet(params) {
  const url = new URL(WIKI_API);
  url.search = new URLSearchParams({ ...params, format: 'json', origin: '*' }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wiki API HTTP ${res.status}`);
  return res.json();
}

async function fetchKillerList() {
  // Use the wiki category for killers
  const data = await wikiGet({
    action: 'query',
    list: 'categorymembers',
    cmtitle: 'Category:Killers',
    cmlimit: '100',
    cmnamespace: '0'
  });
  const members = data?.query?.categorymembers || [];
  return members
    .map(m => m.title)
    .filter(t => t.startsWith('The ') || t.includes('('));
}

async function fetchKillerAddons(killerName) {
  // Fetch the killer's add-on page
  const pageTitle = `${killerName}/Add-ons`;
  const data = await wikiGet({
    action: 'parse',
    page: pageTitle,
    prop: 'wikitext',
    section: '0'
  });

  const wikitext = data?.parse?.wikitext?.['*'] || '';
  return parseAddonNames(wikitext);
}

function parseAddonNames(wikitext) {
  const names = [];
  // Match addon names from wiki table rows: | [[Name]] or | Name |
  const patterns = [
    /\|\s*\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]/g,   // [[Name]] or [[Name|display]]
    /^\|\s*([A-Z][^|{\n]{3,40}?)\s*\|/gm         // bare table cell that looks like a name
  ];

  const seen = new Set();
  for (const re of patterns) {
    let m;
    while ((m = re.exec(wikitext)) !== null) {
      const name = m[1].trim();
      // Filter out obvious non-addon entries
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
  return names.slice(0, 20); // cap at 20 — each killer has exactly 20 add-ons
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

  // Show data source badge
  const existing = document.getElementById('dataSourceBadge');
  if (existing) existing.remove();
  const badge = document.createElement('div');
  badge.id = 'dataSourceBadge';
  badge.className = 'data-source-badge' + (source === 'wiki' || source === 'cache' ? ' live' : '');
  badge.textContent = source === 'wiki' ? '● Live wiki data'
    : source === 'cache' ? '● Cached wiki data'
    : '○ Fallback data — use Sync to update';
  killerSelect.closest('.form-group').appendChild(badge);
}

function updatePowerPreview() {
  const idx = killerSelect.value;
  if (idx === '' || idx === null) {
    killerPowerPreview.innerHTML = '';
    return;
  }
  const k = activeKillers[parseInt(idx)];
  let html = '';
  if (k.power) html += `<span class="power-name">⚡ ${k.power}:</span>${k.powerDesc}`;
  if (k.addons && k.addons.length > 0) {
    html += `<div style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-dim)">Add-ons: ${k.addons.join(', ')}</div>`;
  }
  killerPowerPreview.innerHTML = html;
}

killerSelect.addEventListener('change', updatePowerPreview);

// ── Surprise Me Toggle ────────────────────────────────────────────────────────
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

// ── Rendering helpers ─────────────────────────────────────────────────────────
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

Format each idea clearly. Make titles punchy and engaging — the kind that get clicks in the DbD community.`;

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

  const addonContext = killer.addons && killer.addons.length > 0
    ? `\n**${killer.name}'s actual add-ons (use ONLY these, no others):**\n${killer.addons.join(', ')}`
    : '\n**Note: No add-on list available — use your best knowledge of this killer\'s real add-ons only.**';

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
