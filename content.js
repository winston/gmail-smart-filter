(() => {
  const BAR_ID        = 'gsf-filter-bar';
  const BACK_BAR_ID   = 'gsf-back-bar';
  const MAX_CHIPS     = 50;
  const BACK_KEY      = 'gsf_back_url';
  const STABILIZE_MS  = 800;   // ms after last mutation before scanning
  const FALLBACK_MS   = 6000;  // hard timeout if threads never change

  // ── Gmail DOM selectors ──────────────────────────────────────────────────────
  const SEL_THREAD_ROW  = 'tr.zA';
  const SEL_UNREAD_ROW  = 'tr.zA.zE';
  const SEL_SENDER_SPAN = 'span[email]';
  const SEL_SENDER_ZF   = 'span.zF';

  // ── State ────────────────────────────────────────────────────────────────────
  let lastHash              = '';
  let lastRenderKey         = '';
  let stabilizeTimer        = null;
  let fallbackTimer         = null;
  let navDebounce           = null;
  let awaitingThreadChange  = false;   // true after nav, until thread list swaps
  let preNavFingerprint     = '';      // thread list state captured just before nav

  // ── URL allowlist ─────────────────────────────────────────────────────────────

  function isAllowedPage() {
    const hash = decodeURIComponent(location.hash);
    return hash === '#inbox' || hash.startsWith('#section_query/');
  }

  // ── Thread list fingerprint ───────────────────────────────────────────────────
  // A cheap snapshot of the current thread list so we can detect when Gmail
  // has actually replaced the rows after navigation.

  function threadFingerprint() {
    const rows = document.querySelectorAll(SEL_THREAD_ROW);
    const first = rows[0]?.textContent?.trim().slice(0, 60) || '';
    return `${rows.length}::${first}`;
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────────

  function extractEmail(row) {
    const s = row.querySelector(SEL_SENDER_SPAN);
    if (s) {
      const addr = s.getAttribute('email');
      if (addr && addr.includes('@')) return addr.toLowerCase().trim();
    }
    const zf = row.querySelector(SEL_SENDER_ZF);
    if (zf) {
      const title = zf.getAttribute('title') || '';
      const m = title.match(/<([^>]+@[^>]+)>/);
      if (m) return m[1].toLowerCase().trim();
      if (title.includes('@')) return title.toLowerCase().trim();
      const t = zf.textContent.trim();
      if (t.includes('@')) return t.toLowerCase();
    }
    return null;
  }

  function extractName(row) {
    const s = row.querySelector(SEL_SENDER_SPAN);
    if (s) {
      const name = s.getAttribute('name') || s.textContent.trim();
      if (name) return name;
    }
    const zf = row.querySelector(SEL_SENDER_ZF);
    if (zf) {
      const title = zf.getAttribute('title') || '';
      const m = title.match(/^(.+?)\s*</);
      if (m) return m[1].trim();
      return zf.textContent.trim();
    }
    return null;
  }

  function getAccountIndex() {
    const m = location.pathname.match(/\/u\/(\d+)\//);
    return m ? m[1] : '0';
  }

  function buildSearchUrl(email) {
    const q = encodeURIComponent(`from:${email} is:unread`);
    return `https://mail.google.com/mail/u/${getAccountIndex()}/#search/${q}`;
  }

  // ── DOM scan ─────────────────────────────────────────────────────────────────

  function scanDom() {
    const map = new Map();
    for (const row of document.querySelectorAll(SEL_UNREAD_ROW)) {
      // Skip rows hidden by Gmail (accumulated from previous view navigations)
      if (!row.offsetParent) continue;
      const email = extractEmail(row);
      if (!email) continue;
      if (!map.has(email)) map.set(email, { name: extractName(row) || email, count: 0 });
      map.get(email).count++;
    }
    return map;
  }

  function sortAndSlice(map) {
    return [...map.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, MAX_CHIPS);
  }

  // ── Scan ─────────────────────────────────────────────────────────────────────

  function doScan() {
    clearTimeout(fallbackTimer);
    clearTimeout(stabilizeTimer);
    awaitingThreadChange = false;
    if (!isAllowedPage()) return;

    const domMap = scanDom();
    if (!domMap.size) { removeBar(); return; }
    renderBar(sortAndSlice(domMap));
  }

  function resetStabilizeTimer() {
    clearTimeout(stabilizeTimer);
    stabilizeTimer = setTimeout(doScan, STABILIZE_MS);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  function renderBar(entries) {
    const newKey = entries.map(([e, d]) => `${e}:${d.count}`).join('|');
    if (newKey === lastRenderKey) return;
    lastRenderKey = newKey;

    let bar = document.getElementById(BAR_ID);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = BAR_ID;
      if (!injectBar(bar)) return;
    }

    bar.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'gsf-label';
    label.textContent = 'Filter By Sender';
    bar.appendChild(label);

    for (const [email, { name, count }] of entries) {
      const chip = document.createElement('a');
      chip.className = 'gsf-chip';
      chip.href = buildSearchUrl(email);
      chip.title = `Show all unread from ${email}`;

      chip.addEventListener('click', () => {
        sessionStorage.setItem(BACK_KEY, location.href);
      });

      const nameSpan = document.createElement('span');
      nameSpan.className = 'gsf-chip-name';
      nameSpan.textContent = name;

      const badge = document.createElement('span');
      badge.className = 'gsf-chip-badge';
      badge.textContent = count;

      chip.appendChild(nameSpan);
      chip.appendChild(badge);
      bar.appendChild(chip);
    }
  }

  function showLoadingBar() {
    let bar = document.getElementById(BAR_ID);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = BAR_ID;
      if (!injectBar(bar)) return;
    }
    bar.innerHTML = '';
    lastRenderKey = '';

    const label = document.createElement('span');
    label.className = 'gsf-label';
    label.textContent = 'Filter By Sender';
    bar.appendChild(label);

    const spinner = document.createElement('span');
    spinner.className = 'gsf-spinner';
    bar.appendChild(spinner);

    const hint = document.createElement('span');
    hint.className = 'gsf-loading-text';
    hint.textContent = 'Loading…';
    bar.appendChild(hint);
  }

  function injectBar(bar) {
    const candidates = [
      () => document.querySelector('div[role="main"] .ae4'),
      () => document.querySelector('div[role="main"] .Cp'),
      () => document.querySelector('div[gh="tl"]'),
      () => document.querySelector('div[role="main"]'),
    ];
    for (const fn of candidates) {
      const target = fn();
      if (target) { target.insertAdjacentElement('afterbegin', bar); return true; }
    }
    return false;
  }

  function removeBar() {
    document.getElementById(BAR_ID)?.remove();
    lastRenderKey = '';
  }

  // ── Back button ───────────────────────────────────────────────────────────────

  function showBackBar() {
    if (document.getElementById(BACK_BAR_ID)) return;
    const bar = document.createElement('div');
    bar.id = BACK_BAR_ID;

    const btn = document.createElement('a');
    btn.className = 'gsf-back-btn';
    btn.href = '#';
    btn.textContent = '← Back to Inbox';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const url = sessionStorage.getItem(BACK_KEY);
      sessionStorage.removeItem(BACK_KEY);
      removeBackBar();
      if (url) location.href = url;
      else history.back();
    });

    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  function removeBackBar() {
    document.getElementById(BACK_BAR_ID)?.remove();
  }

  // ── Navigation ────────────────────────────────────────────────────────────────

  function onNavigate() {
    clearTimeout(navDebounce);
    navDebounce = setTimeout(() => {
      const hash = location.hash;
      if (hash === lastHash) return;
      lastHash = hash;

      clearTimeout(stabilizeTimer);
      clearTimeout(fallbackTimer);
      removeBar();
      removeBackBar();

      if (isAllowedPage()) {
        sessionStorage.removeItem(BACK_KEY);
        showLoadingBar();
        // Snapshot the thread list RIGHT NOW (before Gmail swaps it).
        // The MutationObserver will start the scan only once this changes.
        preNavFingerprint  = threadFingerprint();
        awaitingThreadChange = true;
        // Hard fallback in case threads never change
        fallbackTimer = setTimeout(doScan, FALLBACK_MS);
      } else if (sessionStorage.getItem(BACK_KEY)) {
        showBackBar();
      }
    }, 100);
  }

  // ── MutationObserver ─────────────────────────────────────────────────────────

  const observer = new MutationObserver((mutations) => {
    if (!isAllowedPage()) return;

    // Ignore mutations caused by our own bar
    const relevant = mutations.some((m) => {
      if (m.type !== 'childList') return false;
      if (m.target.closest?.(`#${BAR_ID}`) || m.target.id === BAR_ID) return false;
      for (const node of m.addedNodes) {
        if (node.id === BAR_ID || node.id === BACK_BAR_ID) return false;
      }
      return m.addedNodes.length > 0 || m.removedNodes.length > 0;
    });
    if (!relevant) return;

    if (awaitingThreadChange) {
      const current = threadFingerprint();
      if (current !== preNavFingerprint) {
        awaitingThreadChange = false;
        preNavFingerprint = current;
        resetStabilizeTimer();
      }
    } else {
      // Normal background updates — reset stabilize timer
      resetStabilizeTimer();
    }
  });

  // ── Boot ─────────────────────────────────────────────────────────────────────

  function init() {
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', onNavigate);
    window.addEventListener('popstate',   onNavigate);

    const origPush    = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState    = (...a) => { origPush(...a);    onNavigate(); };
    history.replaceState = (...a) => { origReplace(...a); onNavigate(); };

    setInterval(() => { if (location.hash !== lastHash) onNavigate(); }, 500);

    if (isAllowedPage()) {
      showLoadingBar();
      preNavFingerprint  = '';
      awaitingThreadChange = true;
      fallbackTimer = setTimeout(doScan, FALLBACK_MS);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
