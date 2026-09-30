const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function left(d) {
  const s = d - Date.now();
  if (s <= 0) return ['Completed', 'done'];
  const m = s / 6e4 | 0, h = m / 60 | 0, dd = h / 24 | 0;
  return dd >= 1 ? [dd + ' day' + (dd > 1 ? 's' : '') + ' left', dd < 3 ? 'warn' : 'ok']
    : h >= 1 ? [h + 'h ' + m % 60 + 'm left', 'crit'] : [m + ' min left', 'crit'];
}
const label = u => { try { const h = new URL(u).hostname; return /forms|docs\.google/.test(h) ? 'Form' : h.replace(/^www\./, ''); } catch (e) { return 'Link'; } };
function table(title, list) {
  const up = list.filter(x => x.d > Date.now()).sort((a, b) => a.d - b.d);
  const dn = list.filter(x => x.d <= Date.now()).sort((a, b) => b.d - a.d).slice(0, 8);
  const rows = [...up, ...dn].map(x => {
    const [l, c] = left(x.d);
    return `<tr class="${c == 'done' ? 'd' : ''}"><td>${esc(x.company)}<br><small>${esc(x.subject)}</small></td>
    <td>${x.d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
    <td class="${c}">${l}</td>
    <td>${x.u.map(u => `<a target="_blank" href="${esc(u)}">${esc(label(u))}</a>`).join('') || '<small>see notice</small>'}</td></tr>`;
  }).join('');
  return `<h3>${title} (${up.length} open)</h3><table><tr><th>Company</th><th>Deadline</th><th>Time left</th><th>Link</th></tr>${rows || '<tr><td colspan=4>None yet</td></tr>'}</table>`;
}
function render() {
  chrome.storage.local.get({ n: {}, t: 0 }, ({ n, t }) => {
    const all = build(n);
    document.getElementById('info').innerHTML = t
      ? `<small>${Object.keys(n).length} notices scanned · last sync ${new Date(t).toLocaleString()}</small>`
      : '<b>No data yet.</b> Open ERP → CDC → Notice Board once.';
    document.getElementById('out').innerHTML =
      table('🔵 Placement', all.filter(x => x.type == 'PLACEMENT')) +
      table('🟣 Internship', all.filter(x => x.type == 'INTERNSHIP'));
  });
}
render(); setInterval(render, 30000);
