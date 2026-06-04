'use strict';

const API_KEY_STORAGE    = 'dbd_gemini_api_key';
const GITHUB_PAT_STORAGE = 'dbd_github_pat';
const FEEDME_STORAGE     = 'dbd_feedme_data';
const WORKER_URL         = 'https://aliveatnight-proxy.portgamingsttv.workers.dev';
const GITHUB_REPO        = 'Kibbols/AliveAtNight';
const GITHUB_FILE        = 'FEEDME';

let apiKey    = localStorage.getItem(API_KEY_STORAGE)    || '';
let githubPAT = localStorage.getItem(GITHUB_PAT_STORAGE) || '';
let activeKillers = [];

// ── DOM ───────────────────────────────────────────────────────────────────────
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
const patInput        = document.getElementById('patInput');
const lockOverlay     = document.getElementById('lockOverlay');
const lockStatus      = document.getElementById('lockStatus');
const lockCountdown   = document.getElementById('lockCountdown');
const tabs            = document.querySelectorAll('.tab');
const panels          = document.querySelectorAll('.panel');
const killerSelect       = document.getElementById('killerSelect');
const killerPowerPreview = document.getElementById('killerPowerPreview');
const surpriseMe         = document.getElementById('surpriseMe');
const killerPromptGroup  = document.getElementById('killerPromptGroup');
const killerPrompt       = document.getElementById('killerPrompt');
const survivorPrompt  = document.getElementById('survivorPrompt');
const survivorGenBtn  = document.getElementById('survivorGenBtn');
const survivorResults = document.getElementById('survivorResults');
const killerGenBtn    = document.getElementById('killerGenBtn');
const killerResults   = document.getElementById('killerResults');

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  if (githubPAT) patInput.value = '••••••••••••••••';
  try {
    const res = await fetch('FEEDME');
    if (res.ok) {
      const data = JSON.parse(await res.text());
      if (Array.isArray(data) && data.length > 0) { activeKillers = data; populateKillerSelect(activeKillers, 'wiki'); checkKeyBanner(); return; }
    }
  } catch (_) {}
  try {
    const stored = localStorage.getItem(FEEDME_STORAGE);
    if (stored) {
      const data = JSON.parse(stored);
      if (Array.isArray(data) && data.length > 0) { activeKillers = data; populateKillerSelect(activeKillers, 'cache'); checkKeyBanner(); return; }
    }
  } catch (_) {}
  populateKillerSelect([], 'empty');
  checkKeyBanner();
})();

// ── API Key ───────────────────────────────────────────────────────────────────
function checkKeyBanner() { noKeyBanner.classList.toggle('visible', !apiKey); }
function openApiModal() { apiKeyInput.value = apiKey; apiModal.classList.add('open'); setTimeout(() => apiKeyInput.focus(), 50); }
function closeApiModal() { apiModal.classList.remove('open'); }
function saveApiKey() { const v = apiKeyInput.value.trim(); if (v) { apiKey = v; localStorage.setItem(API_KEY_STORAGE, v); } checkKeyBanner(); closeApiModal(); }
apiToggleBtn.addEventListener('click', openApiModal);
apiSaveBtn.addEventListener('click', saveApiKey);
apiCancelBtn.addEventListener('click', closeApiModal);
setKeyBannerBtn.addEventListener('click', openApiModal);
apiModal.addEventListener('click', e => { if (e.target === apiModal) closeApiModal(); });
apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveApiKey(); });

// ── Sync Modal ────────────────────────────────────────────────────────────────
syncBtn.addEventListener('click', () => { syncStatus.innerHTML = ''; syncStartBtn.disabled = false; syncStartBtn.textContent = '⟳ Start Sync'; syncStartBtn.style.display = ''; syncModal.classList.add('open'); });
syncCancelBtn.addEventListener('click', () => syncModal.classList.remove('open'));
syncModal.addEventListener('click', e => { if (e.target === syncModal) syncModal.classList.remove('open'); });
syncStartBtn.addEventListener('click', runSync);
patInput.addEventListener('change', () => { const v = patInput.value.trim(); if (v && !v.startsWith('•')) { githubPAT = v; localStorage.setItem(GITHUB_PAT_STORAGE, v); patInput.value = '••••••••••••••••'; } });

function logSync(msg, cls = '') {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  syncStatus.appendChild(line);
  syncStatus.scrollTop = syncStatus.scrollHeight;
}

// ── Wiki API ──────────────────────────────────────────────────────────────────
async function wikiGetModule(title) {
  const url = new URL(WORKER_URL);
  url.search = new URLSearchParams({ action: 'query', prop: 'revisions', titles: title, rvprop: 'content', rvslots: 'main', format: 'json' }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
  const data = await res.json();
  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];
  return page?.revisions?.[0]?.slots?.main?.['*'] || page?.revisions?.[0]?.['*'] || '';
}

// Fetch parsed article HTML for a wiki page via the worker (parse API = clean article HTML only)
async function wikiGetHTML(page) {
  const url = new URL(WORKER_URL);
  url.searchParams.set('parse', '1');
  url.searchParams.set('page', page);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Worker HTTP ${res.status} for ${page}`);
  return res.text();
}

// Resolve redirect and fetch power desc + addon descs from rendered killer page HTML
async function fetchPageData(rawPage) {
  // Resolve any #REDIRECT via raw API
  const url = new URL(WORKER_URL);
  url.search = new URLSearchParams({ action: 'query', prop: 'revisions', titles: rawPage, rvprop: 'content', rvslots: 'main', format: 'json' }).toString();
  const res = await fetch(url);
  const data = await res.json();
  const pages = data?.query?.pages || {};
  const pageData = Object.values(pages)[0];
  const raw = pageData?.revisions?.[0]?.slots?.main?.['*'] || pageData?.revisions?.[0]?.['*'] || '';
  let resolvedPage = rawPage;
  if (raw.startsWith('#REDIRECT')) {
    const m = /\[\[([^\]]+)\]\]/.exec(raw);
    if (m) resolvedPage = m[1].replace(/ /g, '_');
  }

  // Fetch rendered HTML
  const html = await wikiGetHTML(resolvedPage);
  if (!html || html.length < 100) return { powerDesc: '', addonDescs: {} };

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Power description — id is "Power_Trivia" in parsed HTML
  let powerDesc = '';
  const powerHeading = doc.getElementById('Power_Trivia') || doc.querySelector('[id^="Power_Trivia"]');
  if (powerHeading) {
    let powerContent = '';
    let currentElement = powerHeading.parentElement;
    let nextNode = currentElement.nextElementSibling;
    while (nextNode) {
      if (nextNode.querySelector && nextNode.querySelector('[id^="Add-ons_for_"]')) break;
      if (nextNode.id && nextNode.id.startsWith('Add-ons_for_')) break;
      if (['P', 'DIV', 'UL', 'DL'].includes(nextNode.tagName)) powerContent += ' ' + nextNode.textContent;
      nextNode = nextNode.nextElementSibling;
    }
    powerDesc = powerContent.replace(/\s+/g, ' ').trim();
  }

  // Addon descriptions
  // The span with id "Add-ons_for_..." lives inside an h3.
  // The wikitable with addon data is the next <table> sibling after that h3.
  const addonDescs = {};
  const addonSpan = doc.querySelector('[id^="Add-ons_for_"]');
  if (addonSpan) {
    let heading = addonSpan.closest('h1, h2, h3, h4, h5, h6');
    if (heading) {
      let sib = heading.nextElementSibling;
      while (sib) {
        if (sib.tagName === 'TABLE') {
          sib.querySelectorAll('tr').forEach(row => {
            const cells = row.querySelectorAll('th, td');
            if (cells.length >= 2) {
              const nameCell = cells.length >= 3 ? cells[1] : cells[0];
              const descCell = cells.length >= 3 ? cells[2] : cells[1];
              if (nameCell && descCell) {
                const name = nameCell.textContent.replace(/\s+/g, ' ').trim();
                const desc = descCell.textContent.replace(/'+/g, '').replace(/\s+/g, ' ').trim();
                if (name.length >= 2 && name.length <= 60 && desc.length > 0) {
                  addonDescs[name] = desc;
                }
              }
            }
          });
          break;
        }
        // Stop if we hit another heading
        if (/^H[1-6]$/.test(sib.tagName)) break;
        sib = sib.nextElementSibling;
      }
    }
  }

  return { powerDesc, addonDescs };
}


// ── Parse killers from Module:Datatable ──────────────────────────────────────
function parseKillersFromLua(lua) {
  const killers = [];
  const blockIdx = lua.indexOf('killers = {');
  if (blockIdx < 0) return killers;
  const outerOpen = lua.indexOf('{', blockIdx);
  let depth = 1, pos = outerOpen + 1, outerClose = -1;
  while (pos < lua.length) {
    if (lua[pos] === '{') depth++;
    else if (lua[pos] === '}') { depth--; if (depth === 0) { outerClose = pos; break; } }
    pos++;
  }
  if (outerClose < 0) return killers;
  const block = lua.slice(outerOpen + 1, outerClose);
  let i = 0;
  while (i < block.length) {
    const open = block.indexOf('{', i);
    if (open < 0) break;
    let d = 1, j = open + 1;
    while (j < block.length && d > 0) {
      if (block[j] === '{') d++;
      else if (block[j] === '}') d--;
      j++;
    }
    const entry = block.slice(open, j);
    i = j;
    const idM    = /\bid\s*=\s*(\d+)/.exec(entry);
    const nameM  = /\bname\s*=\s*"([^"]+)"/.exec(entry);
    const realM  = /\brealName\s*=\s*"([^"]+)"/.exec(entry);
    const powerM = /\bpower\s*=\s*"([^"]+)"/.exec(entry);
    if (!idM || !nameM) continue;
    // Skip non-killer entries (no power and no id in killer range)
    const id = parseInt(idM[1]);
    if (!powerM && id > 43) continue;
    const title    = 'The ' + nameM[1];
    const rawPage  = title.replace(/ /g, '_'); // try title first, redirect will handle it
    const realPage = realM ? realM[1].replace(/ /g, '_') : null;
    killers.push({ id, title, power: powerM ? powerM[1] : '', rawPage, realPage });
  }
  return killers;
}

// ── Parse addons from Module:Datatable/Loadout ────────────────────────────────
function parseLoadout(lua) {
  const addons = [];
  // Find each ["Name"] = { ... } entry using bracket counting to handle nested tables
  let i = 0;
  while (i < lua.length) {
    // Match ["name"] or ['"name with quotes"'] 
    const nameStart = lua.indexOf('[', i);
    if (nameStart < 0) break;
    let name, iAfterName;
    if (lua[nameStart + 1] === "'") {
      // ['"Name"'] format - single-quoted key containing double quotes
      const closeIdx = lua.indexOf("']", nameStart + 2);
      if (closeIdx < 0) { i = nameStart + 1; continue; }
      name = lua.slice(nameStart + 2, closeIdx); // strip surrounding single quotes
      iAfterName = closeIdx + 2;
    } else if (lua[nameStart + 1] === '"') {
      // ["Name"] format
      const closeIdx = lua.indexOf('"]', nameStart + 2);
      if (closeIdx < 0) { i = nameStart + 1; continue; }
      name = lua.slice(nameStart + 2, closeIdx);
      iAfterName = closeIdx + 2;
    } else {
      i = nameStart + 1; continue;
    }
    i = iAfterName;

    // Find the = {
    const eqBrace = lua.indexOf('{', i);
    if (eqBrace < 0) break;
    // Make sure there's just = and whitespace between name and brace
    const between = lua.slice(i, eqBrace).replace(/--[^\n]*/g, '').trim();
    if (!/^=\s*$/.test(between)) { i = eqBrace + 1; continue; }

    // Count braces to find end of props
    let depth = 1, j = eqBrace + 1;
    while (j < lua.length && depth > 0) {
      if (lua[j] === '{') depth++;
      else if (lua[j] === '}') depth--;
      j++;
    }
    const props = lua.slice(eqBrace + 1, j - 1);
    i = j;

    const killerM = /\bkiller\s*=\s*(\d+)/.exec(props);
    const patchM  = /\bpatch\s*=\s*"([^"]+)"/.exec(props);
    if (!killerM) continue;
    if (/\bdecom\s*=\s*true/.test(props) || /\bunused\s*=\s*true/.test(props)) continue;
    addons.push({ name, killerId: killerM[1], patch: patchM ? patchM[1] : '' });
  }
  return addons;
}

// ── Main Sync ─────────────────────────────────────────────────────────────────
async function runSync() {
  const pat = githubPAT;
  if (!pat) { logSync('✗ No GitHub PAT set.', 'err'); return; }
  syncStartBtn.disabled = true;
  syncStatus.innerHTML = '';

  try {
    // Step 1: fetch killer metadata
    logSync('Fetching killer metadata…', 'working');
    const datatableLua = await wikiGetModule('Module:Datatable');
    const killerList = parseKillersFromLua(datatableLua);
    logSync(`✓ Found ${killerList.length} killers`, 'ok');

    // Step 2: fetch addon list
    logSync('Fetching add-on list…', 'working');
    const loadoutLua = await wikiGetModule('Module:Datatable/Loadout');
    const allAddons = parseLoadout(loadoutLua);
    logSync(`✓ ${allAddons.length} add-ons loaded`, 'ok');

    // Build killer ID → addons map
    const killerAddonsMap = new Map();
    for (const addon of allAddons) {
      if (!killerAddonsMap.has(addon.killerId)) killerAddonsMap.set(addon.killerId, []);
      killerAddonsMap.get(addon.killerId).push(addon);
    }

    // Step 3: fetch power desc + addon descs from each killer's rendered HTML page
    logSync('Fetching killer pages (power + add-on descriptions)…', 'working');
    const feedme = [];
    for (const killer of killerList.sort((a, b) => a.title.localeCompare(b.title))) {
      logSync(`  ${killer.title}…`, 'working');
      let powerDesc = '';
      let addonDescs = {};
      try {
        const pageData = await fetchPageData(killer.rawPage);
        powerDesc = pageData.powerDesc;
        addonDescs = pageData.addonDescs;
      } catch (e) {
        logSync(`  ⚠ Page fetch failed: ${e.message}`, 'warn');
      }

      const addonEntries = killerAddonsMap.get(String(killer.id)) || [];
      const addons = addonEntries.map(a => ({ name: a.name, desc: addonDescs[a.name] || '' }));
      feedme.push({ name: killer.title, power: killer.power, powerDesc, addons });
      logSync(`  ✓ ${addons.length} add-ons, powerDesc: ${powerDesc.length} chars`, 'ok');
    }

    // Step 6: push
    const json = JSON.stringify(feedme, null, 2);
    localStorage.setItem(FEEDME_STORAGE, json);
    activeKillers = feedme;
    populateKillerSelect(activeKillers, 'wiki');

    logSync('Pushing FEEDME to GitHub…', 'working');
    await pushFeedme(json, pat);
    logSync('✓ FEEDME committed!', 'ok');
    logSync('✓ Sync complete!', 'ok');

    syncStartBtn.style.display = 'none';
    const pushBtn = document.createElement('button');
    pushBtn.className = 'btn-primary';
    pushBtn.textContent = '⬆ Push & Refresh';
    pushBtn.style.marginTop = '0.5rem';
    pushBtn.addEventListener('click', () => { syncModal.classList.remove('open'); showLockAndRefresh(); });
    syncStatus.appendChild(pushBtn);

  } catch (err) {
    logSync(`✗ Sync failed: ${err.message}`, 'err');
    syncStartBtn.disabled = false;
    syncStartBtn.textContent = '⟳ Retry';
  }
}

// ── GitHub push ───────────────────────────────────────────────────────────────
async function pushFeedme(content, pat) {
  const headers = { 'Authorization': `Bearer ${pat}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
  const apiBase = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
  let sha = null;
  try { const check = await fetch(apiBase, { headers }); if (check.ok) sha = (await check.json()).sha; } catch (_) {}
  const res = await fetch(apiBase, { method: 'PUT', headers, body: JSON.stringify({ message: `chore: sync FEEDME [${new Date().toISOString().slice(0, 10)}]`, content: btoa(unescape(encodeURIComponent(content))), ...(sha ? { sha } : {}) }) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `GitHub HTTP ${res.status}`); }
}

// ── Lock overlay ──────────────────────────────────────────────────────────────
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

// ── Killer dropdown ───────────────────────────────────────────────────────────
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
  badge.textContent = source === 'wiki' ? '● Live wiki data' : source === 'cache' ? '● Cached wiki data' : '○ No data — run Sync to populate';
  killerSelect.closest('.form-group').appendChild(badge);
}

function updatePowerPreview() {
  const idx = killerSelect.value;
  if (idx === '' || idx === null) { killerPowerPreview.innerHTML = ''; return; }
  const k = activeKillers[parseInt(idx)];
  let html = '';
  if (k.power) html += `<span class="power-name">⚡ ${k.power}:</span> ${k.powerDesc}`;
  if (k.addons && k.addons.length > 0) {
    const names = k.addons.map(a => typeof a === 'object' ? a.name : a).join(', ');
    html += `<div style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-dim)">Add-ons: ${names}</div>`;
  }
  killerPowerPreview.innerHTML = html;
}

killerSelect.addEventListener('change', updatePowerPreview);
surpriseMe.addEventListener('change', () => { killerPrompt.disabled = surpriseMe.checked; killerPromptGroup.style.opacity = surpriseMe.checked ? '0.4' : '1'; });
tabs.forEach(tab => { tab.addEventListener('click', () => { tabs.forEach(t => t.classList.remove('active')); panels.forEach(p => p.classList.remove('active')); tab.classList.add('active'); document.getElementById('panel-' + tab.dataset.tab).classList.add('active'); }); });

// ── Gemini ────────────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  if (!apiKey) throw new Error('No API key set. Click ⚙ API Key to add your Gemini key.');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, maxOutputTokens: 2048 } })
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`Gemini API error: ${e?.error?.message || `HTTP ${res.status}`}`); }
  return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function setLoading(c, msg = 'Thinking…') { c.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>${msg}</span></div>`; }
function setError(c, msg) { c.innerHTML = `<div class="error-state">⚠ ${msg}</div>`; }
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

survivorGenBtn.addEventListener('click', async () => {
  const prompt = survivorPrompt.value.trim();
  if (!prompt) { survivorPrompt.focus(); survivorPrompt.style.borderColor = 'var(--accent)'; setTimeout(() => survivorPrompt.style.borderColor = '', 1500); return; }
  survivorGenBtn.disabled = true;
  setLoading(survivorResults, 'Generating survivor video ideas…');
  try { renderMarkdown(survivorResults, await callGemini(`You are a creative YouTube content strategist who specializes in Dead by Daylight (DbD) gaming content.\n\nThe user wants YouTube video ideas for survivor gameplay content based on the following request:\n"${prompt}"\n\nGenerate 4-6 distinct YouTube video concepts. For each concept, provide:\n1. A compelling, click-worthy YouTube video title\n2. A brief description of what the video would cover (2-4 sentences)\n3. Why this would perform well on YouTube for the DbD community\n\nMake titles punchy and engaging.`)); }
  catch (err) { setError(survivorResults, err.message); }
  finally { survivorGenBtn.disabled = false; }
});

killerGenBtn.addEventListener('click', async () => {
  const idx = killerSelect.value;
  if (idx === '' || idx === null) { killerSelect.focus(); return; }
  const killer = activeKillers[parseInt(idx)];
  const isSurprise = surpriseMe.checked;
  const buildRequest = isSurprise ? null : killerPrompt.value.trim();
  if (!isSurprise && !buildRequest) { killerPrompt.focus(); killerPrompt.style.borderColor = 'var(--accent)'; setTimeout(() => killerPrompt.style.borderColor = '', 1500); return; }
  killerGenBtn.disabled = true;
  setLoading(killerResults, `Cooking up ${killer.name} builds…`);
  let addonContext = '\n**Note: No add-on list available — use your best knowledge of this killer\'s real add-ons only.**';
  if (killer.addons && killer.addons.length > 0) {
    const list = killer.addons.map(a => typeof a === 'object' && a.name ? (a.desc ? `- **${a.name}**: ${a.desc}` : `- ${a.name}`) : `- ${a}`).join('\n');
    addonContext = `\n**${killer.name}'s add-ons (use ONLY these, no others):**\n${list}`;
  }
  const intent = isSurprise ? 'Come up with genuinely creative, fun, and interesting builds that would make for entertaining YouTube content. Think outside the meta — find synergies, meme potential, unique playstyles, or high-skill-expression builds that viewers would find exciting to watch.' : `The user wants: "${buildRequest}"`;
  try { renderMarkdown(killerResults, await callGemini(`You are a Dead by Daylight build theorist and YouTube content strategist with deep mechanical knowledge of the game.\n\n**Killer:** ${killer.name}\n**Killer Power — ${killer.power}:** ${killer.powerDesc}${addonContext}\n\n**Critical mechanical rules:**\n- Killer power hits are SPECIAL ATTACKS, not basic attacks. Perks that require "basic attacks" do NOT synergize with power hits unless the perk explicitly says "any attack" or "special attacks".\n- Reason from what each perk DOES mechanically, not its name or flavor text.\n- Only recommend add-ons from the list provided above. Do not invent or substitute add-on names.\n\n${intent}\n\nGenerate 3 distinct perk + add-on builds for ${killer.name}. For each build:\n1. Give the build a catchy name/title (suitable as a YouTube video title)\n2. List exactly 4 perks — for each, briefly explain what it does mechanically and why it fits\n3. List 2 add-ons from the provided list — explain the mechanical effect and why it fits\n4. Write a short "video pitch" (2-3 sentences) — why would viewers want to watch this?\n5. Rate: Difficulty (Beginner/Intermediate/Advanced), Fun Factor (1-5 🔪), Meme Potential (Low/Medium/High)`)); }
  catch (err) { setError(killerResults, err.message); }
  finally { killerGenBtn.disabled = false; }
});'use strict';

const API_KEY_STORAGE    = 'dbd_gemini_api_key';
const GITHUB_PAT_STORAGE = 'dbd_github_pat';
const FEEDME_STORAGE     = 'dbd_feedme_data';
const WORKER_URL         = 'https://aliveatnight-proxy.portgamingsttv.workers.dev';
const GITHUB_REPO        = 'Kibbols/AliveAtNight';
const GITHUB_FILE        = 'FEEDME';

let apiKey    = localStorage.getItem(API_KEY_STORAGE)    || '';
let githubPAT = localStorage.getItem(GITHUB_PAT_STORAGE) || '';
let activeKillers = [];

// ── DOM ───────────────────────────────────────────────────────────────────────
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
const patInput        = document.getElementById('patInput');
const lockOverlay     = document.getElementById('lockOverlay');
const lockStatus      = document.getElementById('lockStatus');
const lockCountdown   = document.getElementById('lockCountdown');
const tabs            = document.querySelectorAll('.tab');
const panels          = document.querySelectorAll('.panel');
const killerSelect       = document.getElementById('killerSelect');
const killerPowerPreview = document.getElementById('killerPowerPreview');
const surpriseMe         = document.getElementById('surpriseMe');
const killerPromptGroup  = document.getElementById('killerPromptGroup');
const killerPrompt       = document.getElementById('killerPrompt');
const survivorPrompt  = document.getElementById('survivorPrompt');
const survivorGenBtn  = document.getElementById('survivorGenBtn');
const survivorResults = document.getElementById('survivorResults');
const killerGenBtn    = document.getElementById('killerGenBtn');
const killerResults   = document.getElementById('killerResults');

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  if (githubPAT) patInput.value = '••••••••••••••••';
  try {
    const res = await fetch('FEEDME');
    if (res.ok) {
      const data = JSON.parse(await res.text());
      if (Array.isArray(data) && data.length > 0) { activeKillers = data; populateKillerSelect(activeKillers, 'wiki'); checkKeyBanner(); return; }
    }
  } catch (_) {}
  try {
    const stored = localStorage.getItem(FEEDME_STORAGE);
    if (stored) {
      const data = JSON.parse(stored);
      if (Array.isArray(data) && data.length > 0) { activeKillers = data; populateKillerSelect(activeKillers, 'cache'); checkKeyBanner(); return; }
    }
  } catch (_) {}
  populateKillerSelect([], 'empty');
  checkKeyBanner();
})();

// ── API Key ───────────────────────────────────────────────────────────────────
function checkKeyBanner() { noKeyBanner.classList.toggle('visible', !apiKey); }
function openApiModal() { apiKeyInput.value = apiKey; apiModal.classList.add('open'); setTimeout(() => apiKeyInput.focus(), 50); }
function closeApiModal() { apiModal.classList.remove('open'); }
function saveApiKey() { const v = apiKeyInput.value.trim(); if (v) { apiKey = v; localStorage.setItem(API_KEY_STORAGE, v); } checkKeyBanner(); closeApiModal(); }
apiToggleBtn.addEventListener('click', openApiModal);
apiSaveBtn.addEventListener('click', saveApiKey);
apiCancelBtn.addEventListener('click', closeApiModal);
setKeyBannerBtn.addEventListener('click', openApiModal);
apiModal.addEventListener('click', e => { if (e.target === apiModal) closeApiModal(); });
apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveApiKey(); });

// ── Sync Modal ────────────────────────────────────────────────────────────────
syncBtn.addEventListener('click', () => { syncStatus.innerHTML = ''; syncStartBtn.disabled = false; syncStartBtn.textContent = '⟳ Start Sync'; syncStartBtn.style.display = ''; syncModal.classList.add('open'); });
syncCancelBtn.addEventListener('click', () => syncModal.classList.remove('open'));
syncModal.addEventListener('click', e => { if (e.target === syncModal) syncModal.classList.remove('open'); });
syncStartBtn.addEventListener('click', runSync);
patInput.addEventListener('change', () => { const v = patInput.value.trim(); if (v && !v.startsWith('•')) { githubPAT = v; localStorage.setItem(GITHUB_PAT_STORAGE, v); patInput.value = '••••••••••••••••'; } });

function logSync(msg, cls = '') {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  syncStatus.appendChild(line);
  syncStatus.scrollTop = syncStatus.scrollHeight;
}

// ── Wiki API ──────────────────────────────────────────────────────────────────
async function wikiGetModule(title) {
  const url = new URL(WORKER_URL);
  url.search = new URLSearchParams({ action: 'query', prop: 'revisions', titles: title, rvprop: 'content', rvslots: 'main', format: 'json' }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
  const data = await res.json();
  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];
  return page?.revisions?.[0]?.slots?.main?.['*'] || page?.revisions?.[0]?.['*'] || '';
}

// Fetch parsed article HTML for a wiki page via the worker (parse API = clean article HTML only)
async function wikiGetHTML(page) {
  const url = new URL(WORKER_URL);
  url.searchParams.set('parse', '1');
  url.searchParams.set('page', page);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Worker HTTP ${res.status} for ${page}`);
  return res.text();
}

// Resolve redirect and fetch power desc + addon descs from rendered killer page HTML
async function fetchPageData(rawPage) {
  // Resolve any #REDIRECT via raw API
  const url = new URL(WORKER_URL);
  url.search = new URLSearchParams({ action: 'query', prop: 'revisions', titles: rawPage, rvprop: 'content', rvslots: 'main', format: 'json' }).toString();
  const res = await fetch(url);
  const data = await res.json();
  const pages = data?.query?.pages || {};
  const pageData = Object.values(pages)[0];
  const raw = pageData?.revisions?.[0]?.slots?.main?.['*'] || pageData?.revisions?.[0]?.['*'] || '';
  let resolvedPage = rawPage;
  if (raw.startsWith('#REDIRECT')) {
    const m = /\[\[([^\]]+)\]\]/.exec(raw);
    if (m) resolvedPage = m[1].replace(/ /g, '_');
  }

  // Fetch rendered HTML
  const html = await wikiGetHTML(resolvedPage);
  if (!html || html.length < 100) return { powerDesc: '', addonDescs: {} };

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Power description — id is "Power_Trivia" in parsed HTML
  let powerDesc = '';
  const powerHeading = doc.getElementById('Power_Trivia') || doc.querySelector('[id^="Power_Trivia"]');
  if (powerHeading) {
    let powerContent = '';
    let currentElement = powerHeading.parentElement;
    let nextNode = currentElement.nextElementSibling;
    while (nextNode) {
      if (nextNode.querySelector && nextNode.querySelector('[id^="Add-ons_for_"]')) break;
      if (nextNode.id && nextNode.id.startsWith('Add-ons_for_')) break;
      if (['P', 'DIV', 'UL', 'DL'].includes(nextNode.tagName)) powerContent += ' ' + nextNode.textContent;
      nextNode = nextNode.nextElementSibling;
    }
    powerDesc = powerContent.replace(/\s+/g, ' ').trim().slice(0, 5000);
  }

  // Addon descriptions
  // The span with id "Add-ons_for_..." lives inside an h3.
  // The wikitable with addon data is the next <table> sibling after that h3.
  const addonDescs = {};
  const addonSpan = doc.querySelector('[id^="Add-ons_for_"]');
  if (addonSpan) {
    let heading = addonSpan.closest('h1, h2, h3, h4, h5, h6');
    if (heading) {
      let sib = heading.nextElementSibling;
      while (sib) {
        if (sib.tagName === 'TABLE') {
          sib.querySelectorAll('tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const nameCell = cells.length >= 3 ? cells[1] : cells[0];
              const descCell = cells.length >= 3 ? cells[2] : cells[1];
              if (nameCell && descCell) {
                const name = nameCell.textContent.replace(/\s+/g, ' ').trim();
                const desc = descCell.textContent.replace(/'+/g, '').replace(/\s+/g, ' ').trim();
                if (name.length >= 2 && name.length <= 60 && desc.length > 0) {
                  addonDescs[name] = desc;
                }
              }
            }
          });
          break;
        }
        // Stop if we hit another heading
        if (/^H[1-6]$/.test(sib.tagName)) break;
        sib = sib.nextElementSibling;
      }
    }
  }

  return { powerDesc, addonDescs };
}


// ── Parse killers from Module:Datatable ──────────────────────────────────────
function parseKillersFromLua(lua) {
  const killers = [];
  const blockIdx = lua.indexOf('killers = {');
  if (blockIdx < 0) return killers;
  const outerOpen = lua.indexOf('{', blockIdx);
  let depth = 1, pos = outerOpen + 1, outerClose = -1;
  while (pos < lua.length) {
    if (lua[pos] === '{') depth++;
    else if (lua[pos] === '}') { depth--; if (depth === 0) { outerClose = pos; break; } }
    pos++;
  }
  if (outerClose < 0) return killers;
  const block = lua.slice(outerOpen + 1, outerClose);
  let i = 0;
  while (i < block.length) {
    const open = block.indexOf('{', i);
    if (open < 0) break;
    let d = 1, j = open + 1;
    while (j < block.length && d > 0) {
      if (block[j] === '{') d++;
      else if (block[j] === '}') d--;
      j++;
    }
    const entry = block.slice(open, j);
    i = j;
    const idM    = /\bid\s*=\s*(\d+)/.exec(entry);
    const nameM  = /\bname\s*=\s*"([^"]+)"/.exec(entry);
    const realM  = /\brealName\s*=\s*"([^"]+)"/.exec(entry);
    const powerM = /\bpower\s*=\s*"([^"]+)"/.exec(entry);
    if (!idM || !nameM) continue;
    // Skip non-killer entries (no power and no id in killer range)
    const id = parseInt(idM[1]);
    if (!powerM && id > 43) continue;
    const title    = 'The ' + nameM[1];
    const rawPage  = title.replace(/ /g, '_'); // try title first, redirect will handle it
    const realPage = realM ? realM[1].replace(/ /g, '_') : null;
    killers.push({ id, title, power: powerM ? powerM[1] : '', rawPage, realPage });
  }
  return killers;
}

// ── Parse addons from Module:Datatable/Loadout ────────────────────────────────
function parseLoadout(lua) {
  const addons = [];
  // Find each ["Name"] = { ... } entry using bracket counting to handle nested tables
  let i = 0;
  while (i < lua.length) {
    // Match ["name"] or ['"name with quotes"'] 
    const nameStart = lua.indexOf('[', i);
    if (nameStart < 0) break;
    let name, iAfterName;
    if (lua[nameStart + 1] === "'") {
      // ['"Name"'] format - single-quoted key containing double quotes
      const closeIdx = lua.indexOf("']", nameStart + 2);
      if (closeIdx < 0) { i = nameStart + 1; continue; }
      name = lua.slice(nameStart + 2, closeIdx); // strip surrounding single quotes
      iAfterName = closeIdx + 2;
    } else if (lua[nameStart + 1] === '"') {
      // ["Name"] format
      const closeIdx = lua.indexOf('"]', nameStart + 2);
      if (closeIdx < 0) { i = nameStart + 1; continue; }
      name = lua.slice(nameStart + 2, closeIdx);
      iAfterName = closeIdx + 2;
    } else {
      i = nameStart + 1; continue;
    }
    i = iAfterName;

    // Find the = {
    const eqBrace = lua.indexOf('{', i);
    if (eqBrace < 0) break;
    // Make sure there's just = and whitespace between name and brace
    const between = lua.slice(i, eqBrace).replace(/--[^\n]*/g, '').trim();
    if (!/^=\s*$/.test(between)) { i = eqBrace + 1; continue; }

    // Count braces to find end of props
    let depth = 1, j = eqBrace + 1;
    while (j < lua.length && depth > 0) {
      if (lua[j] === '{') depth++;
      else if (lua[j] === '}') depth--;
      j++;
    }
    const props = lua.slice(eqBrace + 1, j - 1);
    i = j;

    const killerM = /\bkiller\s*=\s*(\d+)/.exec(props);
    const patchM  = /\bpatch\s*=\s*"([^"]+)"/.exec(props);
    if (!killerM) continue;
    if (/\bdecom\s*=\s*true/.test(props) || /\bunused\s*=\s*true/.test(props)) continue;
    addons.push({ name, killerId: killerM[1], patch: patchM ? patchM[1] : '' });
  }
  return addons;
}

// ── Main Sync ─────────────────────────────────────────────────────────────────
async function runSync() {
  const pat = githubPAT;
  if (!pat) { logSync('✗ No GitHub PAT set.', 'err'); return; }
  syncStartBtn.disabled = true;
  syncStatus.innerHTML = '';

  try {
    // Step 1: fetch killer metadata
    logSync('Fetching killer metadata…', 'working');
    const datatableLua = await wikiGetModule('Module:Datatable');
    const killerList = parseKillersFromLua(datatableLua);
    logSync(`✓ Found ${killerList.length} killers`, 'ok');

    // Step 2: fetch addon list
    logSync('Fetching add-on list…', 'working');
    const loadoutLua = await wikiGetModule('Module:Datatable/Loadout');
    const allAddons = parseLoadout(loadoutLua);
    logSync(`✓ ${allAddons.length} add-ons loaded`, 'ok');

    // Build killer ID → addons map
    const killerAddonsMap = new Map();
    for (const addon of allAddons) {
      if (!killerAddonsMap.has(addon.killerId)) killerAddonsMap.set(addon.killerId, []);
      killerAddonsMap.get(addon.killerId).push(addon);
    }

    // Step 3: fetch power desc + addon descs from each killer's rendered HTML page
    logSync('Fetching killer pages (power + add-on descriptions)…', 'working');
    const feedme = [];
    for (const killer of killerList.sort((a, b) => a.title.localeCompare(b.title))) {
      logSync(`  ${killer.title}…`, 'working');
      let powerDesc = '';
      let addonDescs = {};
      try {
        const pageData = await fetchPageData(killer.rawPage);
        powerDesc = pageData.powerDesc;
        addonDescs = pageData.addonDescs;
      } catch (e) {
        logSync(`  ⚠ Page fetch failed: ${e.message}`, 'warn');
      }

      const addonEntries = killerAddonsMap.get(String(killer.id)) || [];
      const addons = addonEntries.map(a => ({ name: a.name, desc: addonDescs[a.name] || '' }));
      feedme.push({ name: killer.title, power: killer.power, powerDesc, addons });
      logSync(`  ✓ ${addons.length} add-ons, powerDesc: ${powerDesc.length} chars`, 'ok');
    }

    // Step 6: push
    const json = JSON.stringify(feedme, null, 2);
    localStorage.setItem(FEEDME_STORAGE, json);
    activeKillers = feedme;
    populateKillerSelect(activeKillers, 'wiki');

    logSync('Pushing FEEDME to GitHub…', 'working');
    await pushFeedme(json, pat);
    logSync('✓ FEEDME committed!', 'ok');
    logSync('✓ Sync complete!', 'ok');

    syncStartBtn.style.display = 'none';
    const pushBtn = document.createElement('button');
    pushBtn.className = 'btn-primary';
    pushBtn.textContent = '⬆ Push & Refresh';
    pushBtn.style.marginTop = '0.5rem';
    pushBtn.addEventListener('click', () => { syncModal.classList.remove('open'); showLockAndRefresh(); });
    syncStatus.appendChild(pushBtn);

  } catch (err) {
    logSync(`✗ Sync failed: ${err.message}`, 'err');
    syncStartBtn.disabled = false;
    syncStartBtn.textContent = '⟳ Retry';
  }
}

// ── GitHub push ───────────────────────────────────────────────────────────────
async function pushFeedme(content, pat) {
  const headers = { 'Authorization': `Bearer ${pat}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
  const apiBase = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
  let sha = null;
  try { const check = await fetch(apiBase, { headers }); if (check.ok) sha = (await check.json()).sha; } catch (_) {}
  const res = await fetch(apiBase, { method: 'PUT', headers, body: JSON.stringify({ message: `chore: sync FEEDME [${new Date().toISOString().slice(0, 10)}]`, content: btoa(unescape(encodeURIComponent(content))), ...(sha ? { sha } : {}) }) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `GitHub HTTP ${res.status}`); }
}

// ── Lock overlay ──────────────────────────────────────────────────────────────
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

// ── Killer dropdown ───────────────────────────────────────────────────────────
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
  badge.textContent = source === 'wiki' ? '● Live wiki data' : source === 'cache' ? '● Cached wiki data' : '○ No data — run Sync to populate';
  killerSelect.closest('.form-group').appendChild(badge);
}

function updatePowerPreview() {
  const idx = killerSelect.value;
  if (idx === '' || idx === null) { killerPowerPreview.innerHTML = ''; return; }
  const k = activeKillers[parseInt(idx)];
  let html = '';
  if (k.power) html += `<span class="power-name">⚡ ${k.power}:</span> ${k.powerDesc}`;
  if (k.addons && k.addons.length > 0) {
    const names = k.addons.map(a => typeof a === 'object' ? a.name : a).join(', ');
    html += `<div style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-dim)">Add-ons: ${names}</div>`;
  }
  killerPowerPreview.innerHTML = html;
}

killerSelect.addEventListener('change', updatePowerPreview);
surpriseMe.addEventListener('change', () => { killerPrompt.disabled = surpriseMe.checked; killerPromptGroup.style.opacity = surpriseMe.checked ? '0.4' : '1'; });
tabs.forEach(tab => { tab.addEventListener('click', () => { tabs.forEach(t => t.classList.remove('active')); panels.forEach(p => p.classList.remove('active')); tab.classList.add('active'); document.getElementById('panel-' + tab.dataset.tab).classList.add('active'); }); });

// ── Gemini ────────────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  if (!apiKey) throw new Error('No API key set. Click ⚙ API Key to add your Gemini key.');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, maxOutputTokens: 2048 } })
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`Gemini API error: ${e?.error?.message || `HTTP ${res.status}`}`); }
  return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function setLoading(c, msg = 'Thinking…') { c.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>${msg}</span></div>`; }
function setError(c, msg) { c.innerHTML = `<div class="error-state">⚠ ${msg}</div>`; }
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

survivorGenBtn.addEventListener('click', async () => {
  const prompt = survivorPrompt.value.trim();
  if (!prompt) { survivorPrompt.focus(); survivorPrompt.style.borderColor = 'var(--accent)'; setTimeout(() => survivorPrompt.style.borderColor = '', 1500); return; }
  survivorGenBtn.disabled = true;
  setLoading(survivorResults, 'Generating survivor video ideas…');
  try { renderMarkdown(survivorResults, await callGemini(`You are a creative YouTube content strategist who specializes in Dead by Daylight (DbD) gaming content.\n\nThe user wants YouTube video ideas for survivor gameplay content based on the following request:\n"${prompt}"\n\nGenerate 4-6 distinct YouTube video concepts. For each concept, provide:\n1. A compelling, click-worthy YouTube video title\n2. A brief description of what the video would cover (2-4 sentences)\n3. Why this would perform well on YouTube for the DbD community\n\nMake titles punchy and engaging.`)); }
  catch (err) { setError(survivorResults, err.message); }
  finally { survivorGenBtn.disabled = false; }
});

killerGenBtn.addEventListener('click', async () => {
  const idx = killerSelect.value;
  if (idx === '' || idx === null) { killerSelect.focus(); return; }
  const killer = activeKillers[parseInt(idx)];
  const isSurprise = surpriseMe.checked;
  const buildRequest = isSurprise ? null : killerPrompt.value.trim();
  if (!isSurprise && !buildRequest) { killerPrompt.focus(); killerPrompt.style.borderColor = 'var(--accent)'; setTimeout(() => killerPrompt.style.borderColor = '', 1500); return; }
  killerGenBtn.disabled = true;
  setLoading(killerResults, `Cooking up ${killer.name} builds…`);
  let addonContext = '\n**Note: No add-on list available — use your best knowledge of this killer\'s real add-ons only.**';
  if (killer.addons && killer.addons.length > 0) {
    const list = killer.addons.map(a => typeof a === 'object' && a.name ? (a.desc ? `- **${a.name}**: ${a.desc}` : `- ${a.name}`) : `- ${a}`).join('\n');
    addonContext = `\n**${killer.name}'s add-ons (use ONLY these, no others):**\n${list}`;
  }
  const intent = isSurprise ? 'Come up with genuinely creative, fun, and interesting builds that would make for entertaining YouTube content. Think outside the meta — find synergies, meme potential, unique playstyles, or high-skill-expression builds that viewers would find exciting to watch.' : `The user wants: "${buildRequest}"`;
  try { renderMarkdown(killerResults, await callGemini(`You are a Dead by Daylight build theorist and YouTube content strategist with deep mechanical knowledge of the game.\n\n**Killer:** ${killer.name}\n**Killer Power — ${killer.power}:** ${killer.powerDesc}${addonContext}\n\n**Critical mechanical rules:**\n- Killer power hits are SPECIAL ATTACKS, not basic attacks. Perks that require "basic attacks" do NOT synergize with power hits unless the perk explicitly says "any attack" or "special attacks".\n- Reason from what each perk DOES mechanically, not its name or flavor text.\n- Only recommend add-ons from the list provided above. Do not invent or substitute add-on names.\n\n${intent}\n\nGenerate 3 distinct perk + add-on builds for ${killer.name}. For each build:\n1. Give the build a catchy name/title (suitable as a YouTube video title)\n2. List exactly 4 perks — for each, briefly explain what it does mechanically and why it fits\n3. List 2 add-ons from the provided list — explain the mechanical effect and why it fits\n4. Write a short "video pitch" (2-3 sentences) — why would viewers want to watch this?\n5. Rate: Difficulty (Beginner/Intermediate/Advanced), Fun Factor (1-5 🔪), Meme Potential (Low/Medium/High)`)); }
  catch (err) { setError(killerResults, err.message); }
  finally { killerGenBtn.disabled = false; }
});
