(() => {
  const BAR_ID       = 'gsf-filter-bar';
  const BACK_BAR_ID  = 'gsf-back-bar';
  const MAX_CHIPS    = 50;
  const BACK_KEY     = 'gsf_back_url';
  const STABILIZE_MS = 400;

  const SEL_UNREAD_ROW = 'tr.zA.zE';

  // Candidates tried in order when injecting the filter bar
  const INJECT_CANDIDATES = [
    'div[role="main"] .ae4',
    'div[role="main"] .Cp',
    'div[gh="tl"]',
    'div[role="main"]',
  ];

  // ── State ────────────────────────────────────────────────────────────────────
  let lastHash      = '';
  let lastRenderKey = '';
  let stabilizeTimer = null;
  let navDebounce    = null;

  // ── DOM helpers ──────────────────────────────────────────────────────────────
  // isAllowedPage, normalizeEmail, extractSender, scanDom live in utils.js

  function getAccountIndex() {
    const m = location.pathname.match(/\/u\/(\d+)\//);
    return m ? m[1] : '0';
  }

  function buildSearchUrl(email) {
    const q = encodeURIComponent(`from:${email} is:unread in:inbox`);
    return `https://mail.google.com/mail/u/${getAccountIndex()}/#search/${q}`;
  }

  // ── Scan ─────────────────────────────────────────────────────────────────────

  function doScan() {
    clearTimeout(stabilizeTimer);
    if (!isAllowedPage(location.hash)) return;
    const domMap = scanDom(document.querySelectorAll(SEL_UNREAD_ROW));
    if (!domMap.size) { removeBar(); return; }
    renderBar([...domMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, MAX_CHIPS));
  }

  function resetStabilizeTimer() {
    clearTimeout(stabilizeTimer);
    stabilizeTimer = setTimeout(doScan, STABILIZE_MS);
  }

  // ── Bar helpers ───────────────────────────────────────────────────────────────

  function getOrCreateBar() {
    let bar = document.getElementById(BAR_ID);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = BAR_ID;
      if (!injectBar(bar)) return null;
    }
    bar.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'gsf-label';
    label.textContent = 'Filter By Sender';
    bar.appendChild(label);
    return bar;
  }

  function injectBar(bar) {
    for (const sel of INJECT_CANDIDATES) {
      const target = document.querySelector(sel);
      if (target) { target.insertAdjacentElement('afterbegin', bar); return true; }
    }
    return false;
  }

  function removeBar() {
    document.getElementById(BAR_ID)?.remove();
    lastRenderKey = '';
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  function renderBar(entries) {
    const newKey = entries.map(([e, d]) => `${e}:${d.count}`).join('|');
    if (newKey === lastRenderKey) return;
    lastRenderKey = newKey;

    const bar = getOrCreateBar();
    if (!bar) return;

    for (const [email, { name, count }] of entries) {
      const chip = document.createElement('a');
      chip.className = 'gsf-chip';
      chip.href = buildSearchUrl(email);
      chip.title = `Show all unread from ${email}`;
      chip.addEventListener('click', () => sessionStorage.setItem(BACK_KEY, location.href));

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
    const bar = getOrCreateBar();
    if (!bar) return;
    lastRenderKey = '';

    const spinner = document.createElement('span');
    spinner.className = 'gsf-spinner';
    bar.appendChild(spinner);

    const hint = document.createElement('span');
    hint.className = 'gsf-loading-text';
    hint.textContent = 'Loading…';
    bar.appendChild(hint);
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
      removeBar();
      removeBackBar();

      if (isAllowedPage(hash)) {
        sessionStorage.removeItem(BACK_KEY);
        showLoadingBar();
        resetStabilizeTimer();
      } else if (sessionStorage.getItem(BACK_KEY)) {
        showBackBar();
      }
    }, 100);
  }

  function watchNavigation() {
    window.addEventListener('hashchange', onNavigate);
    window.addEventListener('popstate',   onNavigate);

    const origPush    = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState    = (...a) => { origPush(...a);    onNavigate(); };
    history.replaceState = (...a) => { origReplace(...a); onNavigate(); };

    // Fallback: catch any navigation Gmail handles before our overrides
    setInterval(() => { if (location.hash !== lastHash) onNavigate(); }, 500);
  }

  // ── MutationObserver ─────────────────────────────────────────────────────────

  const observer = new MutationObserver((mutations) => {
    if (!isAllowedPage(location.hash)) return;

    const relevant = mutations.some((m) => {
      if (m.type !== 'childList') return false;
      if (m.target.closest?.(`#${BAR_ID}`) || m.target.id === BAR_ID) return false;
      for (const node of m.addedNodes) {
        if (node.id === BAR_ID || node.id === BACK_BAR_ID) return false;
      }
      return m.addedNodes.length > 0 || m.removedNodes.length > 0;
    });
    if (!relevant) return;

    resetStabilizeTimer();
  });

  // ── Boot ─────────────────────────────────────────────────────────────────────

  function init() {
    observer.observe(document.body, { childList: true, subtree: true });
    watchNavigation();

    if (isAllowedPage(location.hash)) {
      showLoadingBar();
      resetStabilizeTimer();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
