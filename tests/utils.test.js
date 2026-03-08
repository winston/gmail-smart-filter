const { isAllowedPage, normalizeEmail, extractSender, scanDom } = require('../utils.js');

// ── isAllowedPage ─────────────────────────────────────────────────────────────

describe('isAllowedPage', () => {
  test('allows #inbox', () => {
    expect(isAllowedPage('#inbox')).toBe(true);
  });

  test('allows #section_query/QUERY with no message id', () => {
    expect(isAllowedPage('#section_query/from%3Afoo%40bar.com')).toBe(true);
  });

  test('rejects #section_query/QUERY/MESSAGE_ID (individual email view)', () => {
    expect(isAllowedPage('#section_query/from%3Afoo%40bar.com/msg123')).toBe(false);
  });

  test('rejects #search', () => {
    expect(isAllowedPage('#search/something')).toBe(false);
  });

  test('rejects #sent', () => {
    expect(isAllowedPage('#sent')).toBe(false);
  });

  test('rejects empty hash', () => {
    expect(isAllowedPage('')).toBe(false);
  });

  test('decodes percent-encoded hash and allows it', () => {
    // decodeURIComponent('%23inbox') → '#inbox' which is allowed
    expect(isAllowedPage('%23inbox')).toBe(true);
  });
});

// ── normalizeEmail ────────────────────────────────────────────────────────────

describe('normalizeEmail', () => {
  test('lowercases', () => {
    expect(normalizeEmail('FOO@BAR.COM')).toBe('foo@bar.com');
  });

  test('trims whitespace', () => {
    expect(normalizeEmail('  foo@bar.com  ')).toBe('foo@bar.com');
  });

  test('strips +tag', () => {
    expect(normalizeEmail('foo+tag@bar.com')).toBe('foo@bar.com');
  });

  test('strips long +tag', () => {
    expect(normalizeEmail('lenny+how-i-ai@substack.com')).toBe('lenny@substack.com');
  });

  test('does not alter email without +tag', () => {
    expect(normalizeEmail('foo@bar.com')).toBe('foo@bar.com');
  });

  test('handles uppercase + lowercases + strips +tag together', () => {
    expect(normalizeEmail('  Lenny+Newsletter@Substack.COM  ')).toBe('lenny@substack.com');
  });
});

// ── extractSender ─────────────────────────────────────────────────────────────

function makeRow(html) {
  const tr = document.createElement('tr');
  tr.innerHTML = html;
  // Make offsetParent non-null by appending to document body
  document.body.appendChild(tr);
  return tr;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('extractSender', () => {
  test('extracts from span[email] attribute', () => {
    const row = makeRow('<span email="foo@bar.com" name="Foo Bar">Foo Bar</span>');
    expect(extractSender(row)).toEqual({ email: 'foo@bar.com', name: 'Foo Bar' });
  });

  test('uses textContent as name when name attribute is absent', () => {
    const row = makeRow('<span email="foo@bar.com">My Name</span>');
    expect(extractSender(row)).toEqual({ email: 'foo@bar.com', name: 'My Name' });
  });

  test('normalizes email from span[email]', () => {
    const row = makeRow('<span email="Foo+tag@Bar.COM" name="Foo">Foo</span>');
    expect(extractSender(row)).toEqual({ email: 'foo@bar.com', name: 'Foo' });
  });

  test('falls back to span.zF with angle bracket title', () => {
    const row = makeRow('<span class="zF" title="John Doe &lt;john@example.com&gt;">John Doe</span>');
    expect(extractSender(row)).toEqual({ email: 'john@example.com', name: 'John Doe' });
  });

  test('falls back to span.zF with bare email in title', () => {
    const row = makeRow('<span class="zF" title="foo@bar.com">foo@bar.com</span>');
    expect(extractSender(row)).toEqual({ email: 'foo@bar.com', name: 'foo@bar.com' });
  });

  test('falls back to span.zF textContent when title has no email', () => {
    const row = makeRow('<span class="zF" title="No Email Here">hello@world.com</span>');
    // title has no @, falls to textContent
    expect(extractSender(row)).toEqual({ email: 'hello@world.com', name: 'hello@world.com' });
  });

  test('returns null when no sender info found', () => {
    const row = makeRow('<td>Nothing here</td>');
    expect(extractSender(row)).toBeNull();
  });

  test('ignores span[email] without @ in address', () => {
    const row = makeRow('<span email="notanemail" name="X">X</span><span class="zF" title="real@email.com">real@email.com</span>');
    expect(extractSender(row)).toEqual({ email: 'real@email.com', name: 'real@email.com' });
  });
});

// ── scanDom ───────────────────────────────────────────────────────────────────

describe('scanDom', () => {
  function makeVisibleRow(email, name) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<span email="${email}" name="${name}">${name}</span>`;
    // jsdom: offsetParent is null unless element is in a visible context.
    // We mock it so scanDom considers it visible.
    Object.defineProperty(tr, 'offsetParent', { get: () => document.body, configurable: true });
    return tr;
  }

  function makeHiddenRow(email, name) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<span email="${email}" name="${name}">${name}</span>`;
    Object.defineProperty(tr, 'offsetParent', { get: () => null, configurable: true });
    return tr;
  }

  test('counts a single sender', () => {
    const rows = [makeVisibleRow('a@b.com', 'A')];
    const map = scanDom(rows);
    expect(map.get('a@b.com')).toEqual({ name: 'A', count: 1 });
  });

  test('aggregates multiple rows from same sender', () => {
    const rows = [
      makeVisibleRow('a@b.com', 'A'),
      makeVisibleRow('a@b.com', 'A'),
      makeVisibleRow('a@b.com', 'A'),
    ];
    const map = scanDom(rows);
    expect(map.get('a@b.com').count).toBe(3);
  });

  test('groups +tag variants under base email', () => {
    const rows = [
      makeVisibleRow('lenny@substack.com', 'Lenny'),
      makeVisibleRow('lenny+newsletter@substack.com', 'Lenny'),
    ];
    const map = scanDom(rows);
    expect(map.size).toBe(1);
    expect(map.get('lenny@substack.com').count).toBe(2);
  });

  test('skips hidden rows (offsetParent === null)', () => {
    const rows = [
      makeVisibleRow('a@b.com', 'A'),
      makeHiddenRow('a@b.com', 'A'),
    ];
    const map = scanDom(rows);
    expect(map.get('a@b.com').count).toBe(1);
  });

  test('returns empty map for no rows', () => {
    expect(scanDom([]).size).toBe(0);
  });

  test('handles multiple distinct senders', () => {
    const rows = [
      makeVisibleRow('alice@x.com', 'Alice'),
      makeVisibleRow('bob@y.com', 'Bob'),
      makeVisibleRow('alice@x.com', 'Alice'),
    ];
    const map = scanDom(rows);
    expect(map.size).toBe(2);
    expect(map.get('alice@x.com').count).toBe(2);
    expect(map.get('bob@y.com').count).toBe(1);
  });
});
