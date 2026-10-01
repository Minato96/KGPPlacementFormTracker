const API_BASE =
  'https://kgp-placement-form-tracker-backend.noticeboard.workers.dev';

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

  const m = (s / 60000) | 0;
  const h = (m / 60) | 0;
  const dd = (h / 24) | 0;

  return dd >= 1
    ? [
        dd + ' day' + (dd > 1 ? 's' : '') + ' left',
        dd < 3 ? 'warn' : 'ok'
      ]
    : h >= 1
      ? [h + 'h ' + (m % 60) + 'm left', 'crit']
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
 * ------------------------------------------------------------
 * INSTALLATION ID
 * ------------------------------------------------------------
 */
async function getInstallationId() {
  const existing =
    await chrome.storage.local.get(
      'installation_id'
    );

  if (
    existing.installation_id &&
    typeof existing.installation_id === 'string'
  ) {
    return existing.installation_id;
  }

  const installationId =
    'kgp_install_' + crypto.randomUUID();

  await chrome.storage.local.set({
    installation_id: installationId
  });

  return installationId;
}


/*
 * ------------------------------------------------------------
 * VERIFY LICENSE
 * ------------------------------------------------------------
 */
async function verifyLicense() {
  try {
    const installationId =
      await getInstallationId();

    const response =
      await fetch(
        `${API_BASE}/verify-license`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            installation_id:
              installationId
          })
        }
      );

    if (!response.ok) {
      throw new Error(
        `License verification failed: ${response.status}`
      );
    }

    const data =
      await response.json();

    const isPro =
      data.success === true &&
      data.pro === true &&
      data.status === 'ACTIVE';

    await chrome.storage.local.set({
      pro: isPro,

      license_status:
        data.status || 'UNKNOWN',

      license_checked_at:
        Date.now()
    });

    return {
      pro: isPro,

      status:
        data.status || 'UNKNOWN'
    };

  } catch (error) {

    console.error(
      'License verification error:',
      error
    );

    const cached =
      await chrome.storage.local.get({
        pro: false,

        license_status:
          'UNKNOWN'
      });

    return {
      pro:
        cached.pro === true,

      status:
        cached.license_status
    };
  }
}


/*
 * ------------------------------------------------------------
 * OPEN PRO CHECKOUT
 * ------------------------------------------------------------
 */
async function startProCheckout() {
  try {

    const installationId =
      await getInstallationId();

    const checkoutUrl =
      `${API_BASE}/checkout?installation_id=${encodeURIComponent(
        installationId
      )}`;

    await chrome.tabs.create({
      url: checkoutUrl
    });

  } catch (error) {

    console.error(
      'Could not start PRO checkout:',
      error
    );

    alert(
      'Unable to start PRO checkout. Please try again.'
    );
  }
}


/*
 * ------------------------------------------------------------
 * CHECKBOX STORAGE
 * ------------------------------------------------------------
 *
 * The checkbox state is stored locally.
 *
 * Example:
 *
 * {
 *   "PLACEMENT:1234": true,
 *   "INTERNSHIP:5678": false
 * }
 *
 * Notice ID is used so the state survives popup reloads.
 * ------------------------------------------------------------
 */
async function getCheckedState() {
  const data =
    await chrome.storage.local.get({
      checkedNotices: {}
    });

  return (
    data.checkedNotices || {}
  );
}


async function setCheckedState(
  key,
  checked
) {

  const data =
    await chrome.storage.local.get({
      checkedNotices: {}
    });

  const checkedNotices = {
    ...(data.checkedNotices || {})
  };

  if (checked) {
    checkedNotices[key] = true;
  } else {
    delete checkedNotices[key];
  }

  await chrome.storage.local.set({
    checkedNotices
  });
}


/*
 * ------------------------------------------------------------
 * RENDER FORMS
 * ------------------------------------------------------------
 */
function renderForms(x, isPro) {

  if (!isPro) {
    return '<span class="locked">PRO</span>';
  }

  return x.u.map(u =>
    `<a target="_blank" href="${esc(u)}">${esc(label(u))}</a>`
  ).join('') || '<small>see notice</small>';
}


/*
 * ------------------------------------------------------------
 * RENDER TIME LEFT
 * ------------------------------------------------------------
 */
function renderTimeLeft(x, isPro) {

  if (!isPro) {
    return '<span class="locked">PRO</span>';
  }

  const [l, c] =
    left(x.d);

  return `
    <span class="${c}">
      ${l}
    </span>
  `;
}


/*
 * ------------------------------------------------------------
 * TABLE
 * ------------------------------------------------------------
 */
function table(
  title,
  list,
  isPro,
  checkedNotices
) {

  const now =
    Date.now();

  const up =
    list
      .filter(x => x.d > now)
      .sort(
        (a, b) => a.d - b.d
      );

  const dn =
    list
      .filter(x => x.d <= now)
      .sort(
        (a, b) => b.d - a.d
      )
      .slice(0, 8);

  const rows =
    [...up, ...dn]
      .map(x => {

        /*
         * Use type + notice ID as the unique
         * checkbox identifier.
         */
        const checkboxKey =
          `${x.type}:${x.id}`;

        const isChecked =
          checkedNotices[checkboxKey] === true;

        const [
          deadlineDate,
          deadlineTime
        ] =
          x.d
            .toLocaleString(
              'en-IN',
              {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit'
              }
            )
            .split(', ');

        return `
          <tr
            class="
              ${x.d <= now ? 'd ' : ''}
              ${isChecked ? 'checked-row' : ''}
            "
          >

            <td class="check-cell">

               ${
    isPro
      ? `
        <input
          type="checkbox"
          class="notice-check"
          data-key="${esc(checkboxKey)}"
          ${isChecked ? 'checked' : ''}
          aria-label="Mark ${esc(x.company)} as completed"
        >
      `
      : `
        <span class="locked">PRO</span>
      `
  }

            </td>

            <td>

              ${esc(x.company)}

              <br>

              <small>
                ${esc(x.subject)}
              </small>

            </td>

            <td>

              ${deadlineDate}

              <br>

              <small>
                ${deadlineTime}
              </small>

            </td>

            <td>

              ${renderTimeLeft(
                x,
                isPro
              )}

            </td>

            <td>

              ${renderForms(
                x,
                isPro
              )}

            </td>

          </tr>
        `;
      })
      .join('');

  return `
    <h3>
      ${title}
      (${up.length} open)
    </h3>

    <table>

      <thead>

        <tr>

          <th class="check-header">
            Done
          </th>

          <th>
            Company
          </th>

          <th>
            Deadline
          </th>

          <th>
            Time Left
          </th>

          <th>
            Forms
          </th>

        </tr>

      </thead>

      <tbody>

        ${
          rows ||
          '<tr><td colspan="5">None yet</td></tr>'
        }

      </tbody>

    </table>
  `;
}


/*
 * ------------------------------------------------------------
 * UPGRADE / PRO STATUS
 * ------------------------------------------------------------
 */
function renderUpgrade(
  isPro,
  status
) {

  const upgrade =
    document.getElementById(
      'upgrade'
    );

  const plan =
    document.getElementById(
      'plan'
    );

  if (
    !upgrade ||
    !plan
  ) {
    return;
  }

  if (isPro) {

    plan.textContent =
      'PRO';

    plan.className =
      'plan pro';

    upgrade.innerHTML = `
      <div class="upgrade">

        <div class="upgrade-title">
          PRO is active
        </div>

        <div class="upgrade-text">
          Time remaining and application links are unlocked.
        </div>

      </div>
    `;

    return;
  }


  plan.textContent =
    'FREE';

  plan.className =
    'plan free';

  let statusText =
    'Free users can see company names and deadlines. PRO unlocks time remaining and application links.';

  if (
    status === 'PENDING'
  ) {

    statusText =
      'A PRO payment is pending. Complete the payment and wait for confirmation.';
  }


  upgrade.innerHTML = `
    <div class="upgrade">

      <div class="upgrade-title">
        Unlock PRO
      </div>

      <div class="upgrade-text">
        ${statusText}
      </div>

      <button
        id="upgradeButton"
      >
        Unlock PRO
      </button>

    </div>
  `;


  const button =
    document.getElementById(
      'upgradeButton'
    );

  if (button) {

    button.addEventListener(
      'click',
      startProCheckout
    );
  }
}


/*
 * ------------------------------------------------------------
 * CHECKBOX EVENT HANDLERS
 * ------------------------------------------------------------
 */
function attachCheckboxHandlers() {

  const checkboxes =
    document.querySelectorAll(
      '.notice-check'
    );

  checkboxes.forEach(
    checkbox => {

      checkbox.addEventListener(
        'change',
        async event => {

          const key =
            event.target.dataset.key;

          const checked =
            event.target.checked;

          try {

            await setCheckedState(
              key,
              checked
            );

            const row =
              event.target.closest(
                'tr'
              );

            if (row) {

              row.classList.toggle(
                'checked-row',
                checked
              );
            }

          } catch (error) {

            console.error(
              'Could not save checkbox state:',
              error
            );

          }

        }
      );

    }
  );
}


/*
 * ------------------------------------------------------------
 * MAIN RENDER
 * ------------------------------------------------------------
 */
async function render() {

  const license =
    await verifyLicense();

  const isPro =
    license.pro === true;

  const checkedNotices =
    await getCheckedState();

  chrome.storage.local.get(
    {
      n: {},
      t: 0
    },

    ({ n, t }) => {

      renderUpgrade(
        isPro,
        license.status
      );

      const all =
        build(n);

      const info =
        document.getElementById(
          'info'
        );

      const out =
        document.getElementById(
          'out'
        );

      if (info) {

        info.innerHTML =
          t
            ? `
              <small>
                ${Object.keys(n).length}
                notices scanned ·
                last sync
                ${new Date(t).toLocaleString()}
              </small>
            `
            : `
              <b>No data yet.</b>
              Open ERP → CDC → Notice Board once.
            `;
      }


      if (out) {

        out.innerHTML =
          table(
            'Placement',
            all.filter(
              x =>
                x.type ===
                'PLACEMENT'
            ),
            isPro,
            checkedNotices
          ) +

          table(
            'Internship',
            all.filter(
              x =>
                x.type ===
                'INTERNSHIP'
            ),
            isPro,
            checkedNotices
          );

        /*
         * Attach checkbox event handlers
         * after the rows have been inserted.
         */
        attachCheckboxHandlers();
      }

    }
  );
}


/*
 * ------------------------------------------------------------
 * INITIAL RENDER
 * ------------------------------------------------------------
 */
render();


/*
 * ------------------------------------------------------------
 * REFRESH
 * ------------------------------------------------------------
 *
 * Refresh tracker + license every 30 seconds.
 * ------------------------------------------------------------
 */
setInterval(
  render,
  30000
);