// Isolated world: saves captured notices
addEventListener('message', e => {
  if (e.source !== window || !e.data || e.data.src !== 'kgp-notice') return;
  chrome.storage.local.get({ n: {} }, ({ n }) => {
    e.data.rows.forEach(r => n[r.id] = r);
    chrome.storage.local.set({ n, t: Date.now() });
  });
});
