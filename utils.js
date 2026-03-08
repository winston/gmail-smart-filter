// Pure utility functions shared between content.js and tests

const SEL_SENDER_SPAN = 'span[email]';
const SEL_SENDER_ZF   = 'span.zF';

function isAllowedPage(hash) {
  const h = decodeURIComponent(hash);
  if (h === '#inbox') return true;
  if (h.startsWith('#section_query/')) {
    return !h.slice('#section_query/'.length).includes('/');
  }
  return false;
}

function normalizeEmail(email) {
  return email.toLowerCase().trim().replace(/\+[^@]*@/, '@');
}

function extractSender(row) {
  const s = row.querySelector(SEL_SENDER_SPAN);
  if (s) {
    const addr = s.getAttribute('email');
    if (addr && addr.includes('@')) {
      return { email: normalizeEmail(addr), name: s.getAttribute('name') || s.textContent.trim() };
    }
  }
  const zf = row.querySelector(SEL_SENDER_ZF);
  if (zf) {
    const title = zf.getAttribute('title') || '';
    const angleMatch = title.match(/<([^>]+@[^>]+)>/);
    if (angleMatch) {
      const nameMatch = title.match(/^(.+?)\s*</);
      return { email: normalizeEmail(angleMatch[1]), name: nameMatch ? nameMatch[1].trim() : angleMatch[1] };
    }
    if (title.includes('@')) return { email: normalizeEmail(title), name: title.trim() };
    const t = zf.textContent.trim();
    if (t.includes('@')) return { email: normalizeEmail(t), name: t };
  }
  return null;
}

function scanDom(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.offsetParent) continue;
    const sender = extractSender(row);
    if (!sender) continue;
    if (!map.has(sender.email)) map.set(sender.email, { name: sender.name, count: 0 });
    map.get(sender.email).count++;
  }
  return map;
}

if (typeof module !== 'undefined') {
  module.exports = { isAllowedPage, normalizeEmail, extractSender, scanDom };
}
