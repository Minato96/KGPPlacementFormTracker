const esc = s =>
  String(s ?? '').replace(/[&<>"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[c]));

function left(d) {
  const s = d - Date.now();

  if (s <= 0) {
    return ['Completed', 'done'];
  }

  const m = s / 6e4 | 0;
  const h = m / 60 | 0;
  const dd = h / 24 | 0;

  return dd >= 1
    ? [
        dd + ' day' + (dd > 1 ? 's' : '') + ' left',
        dd < 3 ? 'warn' : 'ok'
      ]
    : h >= 1
      ? [h + 'h ' + m % 60 + 'm left', 'crit']
      : [m + ' min left', 'crit'];
}

const label = u => {
  try {
    const h = new URL(u).hostname;

    return /forms|docs\.google/.test(h)
      ? 'Form'
      : h.replace(/^www\./, '');
  } catch (e) {
    return 'Link';
  }
};


/*
 * Render the Forms column.
 *
 * FREE:
 *     🔒 PRO
 *
 * PRO:
 *     Actual clickable links
 */
function renderForms(x, isPro) {

  if (!isPro) {
    return '<span class="locked">🔒 PRO</span>';
  }

  return x.u.map(u =>
    `<a target="_blank" href="${esc(u)}">${esc(label(u))}</a>`
  ).join('') || '<small>see notice</small>';
}


/*
 * Render the Time Left column.
 *
 * FREE:
 *     🔒 PRO
 *
 * PRO:
 *     Actual remaining time
 */
function renderTimeLeft(x, isPro) {

  if (!isPro) {
    return '<span class="locked">🔒 PRO</span>';
  }

  const [l, c] = left(x.d);

  return `<span class="${c}">${l}</span>`;
}


function table(title, list, isPro) {

  const up = list
    .filter(x => x.d > Date.now())
    .sort((a, b) => a.d - b.d);

  const dn = list
    .filter(x => x.d <= Date.now())
    .sort((a, b) => b.d - a.d)
    .slice(0, 8);

  const rows = [...up, ...dn].map(x => {

    const [deadlineDate, deadlineTime] =
      x.d.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
      }).split(', ');

    return `
      <tr class="${x.d <= Date.now() ? 'd' : ''}">

        <td>
          ${esc(x.company)}
          <br>
          <small>${esc(x.subject)}</small>
        </td>

        <td>
          ${deadlineDate}<br>
          <small>${deadlineTime}</small>
        </td>

        <td>
          ${renderTimeLeft(x, isPro)}
        </td>

        <td>
          ${renderForms(x, isPro)}
        </td>

      </tr>
    `;
  }).join('');

  return `
    <h3>${title} (${up.length} open)</h3>

    <table>
      <tr>
        <th>Company</th>
        <th>Deadline</th>
        <th>Time Left</th>
        <th>Forms</th>
      </tr>

      ${
        rows ||
        '<tr><td colspan="4">None yet</td></tr>'
      }
    </table>
  `;
}


function renderUpgrade(isPro) {

  const upgrade = document.getElementById('upgrade');
  const plan = document.getElementById('plan');

  if (isPro) {

    plan.textContent = '⭐ PRO';
    plan.className = 'plan pro';

    upgrade.innerHTML = `
      <div class="upgrade">
        <div class="upgrade-title">
          ⭐ PRO is active
        </div>

        <div class="upgrade-text">
          Time remaining and application links are unlocked.
        </div>
      </div>
    `;

  } else {

    plan.textContent = 'FREE';
    plan.className = 'plan free';

    upgrade.innerHTML = `
      <div class="upgrade">

        <div class="upgrade-title">
          🔒 Unlock PRO
        </div>

        <div class="upgrade-text">
          Free users can see company names and deadlines.
          PRO unlocks time remaining and application links.
        </div>

        <button id="upgradeButton">
          Unlock PRO
        </button>

      </div>
    `;

    document
      .getElementById('upgradeButton')
      .addEventListener('click', () => {

        alert(
          'Payment integration will be added here later.'
        );

      });
  }
}


function render() {

  chrome.storage.local.get(
    {
      n: {},
      t: 0,
      pro: false
    },

    ({ n, t, pro }) => {

      renderUpgrade(pro);

      const all = build(n);

      document.getElementById('info').innerHTML = t
        ? `<small>
             ${Object.keys(n).length} notices scanned ·
             last sync ${new Date(t).toLocaleString()}
           </small>`

        : '<b>No data yet.</b> Open ERP → CDC → Notice Board once.';

      document.getElementById('out').innerHTML =
        table(
          '🔵 Placement',
          all.filter(x => x.type === 'PLACEMENT'),
          pro
        ) +

        table(
          '🟣 Internship',
          all.filter(x => x.type === 'INTERNSHIP'),
          pro
        );
    }
  );
}


/*
 * TEMPORARY DEVELOPMENT CONTROLS
 *
 * These will be removed when Cashfree/license
 * verification is implemented.
 */

document
  .getElementById('enablePro')
  .addEventListener('click', () => {

    chrome.storage.local.set(
      { pro: true },
      () => render()
    );

  });


document
  .getElementById('disablePro')
  .addEventListener('click', () => {

    chrome.storage.local.set(
      { pro: false },
      () => render()
    );

  });


render();


// Keep the popup updated every 30 seconds.
setInterval(render, 30000);