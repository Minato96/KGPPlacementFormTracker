const T = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*([ap])\\.?m',
  D = '(\\d{1,2})(?:st|nd|rd|th)?\\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?,?\\s*(\\d{4})?',
  MON = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');

function deadline(t, posted) {
  const k = t.search(/till|until|\bby\b|before|deadline|closes/i), s = k < 0 ? t : t.slice(k);
  const a = s.match(new RegExp(T + '\\s*,?\\s*(?:on\\s+)?' + D, 'i'));
  const b = s.match(new RegExp(D + '\\s*,?\\s*(?:at\\s+)?' + T, 'i'));
  const A = a && { i: a.index, h: a[1], mi: a[2], ap: a[3], d: a[4], mo: a[5], y: a[6] };
  const B = b && { i: b.index, d: b[1], mo: b[2], y: b[3], h: b[4], mi: b[5], ap: b[6] };
  let r = [A, B].filter(Boolean).sort((x, y) => x.i - y.i)[0];
  if (!r) {
    const c = s.match(new RegExp(D, 'i'));
    if (!c) return null;
    r = { d: c[1], mo: c[2], y: c[3], h: 11, mi: 59, ap: 'p' };
  }
  const H = (+r.h) % 12 + (/p/i.test(r.ap) ? 12 : 0);
  return new Date(+(r.y || posted.slice(6, 10)), MON.indexOf(r.mo.toLowerCase()), +r.d, H, +(r.mi || 0));
}

function urls(t) {
  return [...t.matchAll(/https?:\/\/[^\s<>"']+/g)].map(m => m[0]
    .replace(/(forms\.gle\/[\w-]{17}).*/, '$1')
    .replace(/(Interested|CDC|Note|Deadline|Portal|Kindly|POC|Students|Registration|Also|Please).*$/, '')
    .replace(/[.,;)]+$/, '')).filter((u, i, a) => a.indexOf(u) === i);
}

function build(n) {
  const m = {};
  Object.values(n).forEach(r => {
    const u = urls(r.text);
    const ok = /^(CV Submission|Date extension)$/i.test(r.subject) ||
      (u.length && !/^(Shortlist|Result|Schedule|PPO|PPT)/i.test(r.subject));
    if (!ok) return;
    const d = deadline(r.text, r.posted);
    if (!d || isNaN(d)) return;
    const k = r.type + '|' + r.company.toLowerCase().replace(/&#\d+;|[^a-z0-9 ]/g, '')
      .replace(/\b(limited|pvt|ltd|inc|private|india|llp|and|the)\b/g, '').replace(/\s+/g, '').slice(0, 12);
    if (!m[k] || r.id > m[k].id) m[k] = { ...r, d, u };
  });
  return Object.values(m);
}
if (typeof module !== 'undefined') module.exports = { deadline, urls, build };
