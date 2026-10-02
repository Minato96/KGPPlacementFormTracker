// Runs in page context: captures notice-grid XML responses
(() => {
  const parse = t => {
    const x = new DOMParser().parseFromString(t.trim(), 'text/xml'), out = [];
    x.querySelectorAll('row').forEach(r => {
      const c = [...r.querySelectorAll('cell')].map(e => e.textContent);
      if (c.length < 7 || !/^(PLACEMENT|INTERNSHIP)$/.test(c[1])) return;
      const a = new DOMParser().parseFromString(c[4], 'text/html').querySelector('a');
      out.push({ id: +c[0], type: c[1], subject: c[2], company: c[3],
        text: ((a && a.textContent) || '').replace(/\s+/g, ' ').slice(0, 1500), posted: c[6] });
    });
    return out;
  };
  const send = rows => rows.length && postMessage({ src: 'kgp-notice', rows }, '*');
  let synced = false;
  const O = XMLHttpRequest.prototype.open, S = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this._r = { m, u }; return O.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    this.addEventListener('load', () => { try {
      if (this.responseType && this.responseType !== 'text') return;
      const t = this.responseText;
      if (!/<rows[\s>]/.test(t) || !/<cell>/.test(t)) return;
      send(parse(t));
      if (!synced && /page=\d+/.test(this._r.u + (typeof b === 'string' ? b : ''))) { synced = true; sync(this._r, b); }
    } catch (e) {} });
    return S.apply(this, arguments);
  };
  async function sync({ m, u }, b) {
    for (let p = 1; p <= 4; p++) {
      const f = s => s.replace(/([?&]page=)\d+/, '$1' + p).replace(/([?&]rows=)\d+/, '$1100');
      try {
        const isS = typeof b === 'string', post = /post/i.test(m);
        const r = await fetch(f(u), { method: m, credentials: 'include',
          body: post ? (isS ? f(b) : b) : undefined,
          headers: post && isS ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {} });
        const rows = parse(await r.text());
        if (!rows.length) break;
        send(rows);
      } catch (e) { break; }
    }
  }
})();
