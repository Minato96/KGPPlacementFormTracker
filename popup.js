const API_BASE =
  'https://kgp-placement-form-tracker-backend.noticeboard.workers.dev';

const SUPABASE_URL =
  'https://clgjswrlcwzmdxhhegtk.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_feaDD3pJrMCv-BPxmxuFYQ_1IW1wK-3';


/*
 * ============================================================
 * PRO ENTITLEMENT SIGNING KEY
 * ============================================================
 *
 * Public half of the ECDSA P-256 keypair the Worker signs PRO
 * entitlement tokens with.
 *
 * The matching private key lives only in the Worker (secret
 * LICENSE_SIGNING_KEY), so this value cannot be used to mint a
 * token — flipping chrome.storage.local.pro no longer unlocks
 * anything.
 *
 * Generate a pair with:
 *     worker/tools/generate-license-keypair.sh
 *
 * Until the placeholder below is replaced, verifyLicenseToken()
 * returns false and PRO stays locked.
 * ============================================================
 */

const LICENSE_PUBLIC_JWK =
  {"kty":"EC","crv":"P-256","x":"VAGAqhtx9Ix1Fp3d6fsXO12UQ1qvRQK360rPGfBTc6Q","y":"MtnJr-i1nzxpywRqRqeYJWtOY3RLvCIcaLzTnMMCBvw"};


/*
 * ============================================================
 * LICENSE CACHE
 * ============================================================
 *
 * Normal license verification:
 *     one server request every 6 hours
 *
 * Restore PRO:
 *     always performs a fresh verification
 * ============================================================
 */

const LICENSE_CACHE_MS =
  6 * 60 * 60 * 1000;

const RESTORE_STATE_MAX_AGE_MS =
  55 * 60 * 1000;

const RESTORE_STORAGE_KEY =
  'restore_pro_state';

/*
 * After clicking Buy PRO, force fresh checks
 * for up to 30 minutes so the popup notices
 * webhook activation.
 */

const PURCHASE_FORCE_VERIFY_MS =
  30 * 60 * 1000;


const esc = s =>
  String(
    s ?? ''
  ).replace(
    /[&<>\"]/g,
    c => ({
      '&':
        '&amp;',

      '<':
        '&lt;',

      '>':
        '&gt;',

      '"':
        '&quot;'
    }[c])
  );


/*
 * ============================================================
 * ENTITLEMENT TOKEN VERIFICATION
 * ============================================================
 *
 * The Worker signs {license_id, installation_id, iat, exp} with
 * ECDSA P-256. We only hold the public key, so we can check a
 * token but never produce one.
 *
 * A missing key, a bad signature, an expired token or a token
 * minted for a different installation all fail closed.
 * ============================================================
 */

function base64UrlToBytes(
  value
) {

  const padded =
    value
      .replace(/-/g, '+')
      .replace(/_/g, '/') +
    '==='.slice(
      (value.length + 3) % 4
    );


  const binary =
    atob(padded);


  const bytes =
    new Uint8Array(
      binary.length
    );


  for (
    let i = 0;
    i < binary.length;
    i++
  ) {

    bytes[i] =
      binary.charCodeAt(i);
  }


  return bytes;
}


async function verifyLicenseToken(
  token,
  installationId
) {

  if (
    !LICENSE_PUBLIC_JWK ||
    typeof token !== 'string'
  ) {

    return false;
  }


  const parts =
    token.split('.');


  if (
    parts.length !== 2
  ) {

    return false;
  }


  const [
    payload,
    signature
  ] = parts;


  try {

    const key =
      await crypto.subtle.importKey(
        'jwk',
        LICENSE_PUBLIC_JWK,
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        false,
        ['verify']
      );


    const valid =
      await crypto.subtle.verify(
        {
          name: 'ECDSA',
          hash: 'SHA-256'
        },
        key,
        base64UrlToBytes(
          signature
        ),
        new TextEncoder().encode(
          payload
        )
      );


    if (!valid) {

      return false;
    }


    const claims =
      JSON.parse(
        new TextDecoder().decode(
          base64UrlToBytes(
            payload
          )
        )
      );


    /*
     * Reject tokens that are expired or were issued for another
     * installation.
     */

    if (
      !claims ||
      claims.v !== 1 ||
      typeof claims.exp !== 'number' ||
      claims.exp <= Date.now() ||
      claims.installation_id !==
        installationId
    ) {

      return false;
    }


    return true;

  } catch (
    error
  ) {

    console.error(
      'License token verification failed:',
      error
    );


    return false;
  }
}


/*
 * ============================================================
 * TIME LEFT
 * ============================================================
 */

function left(d) {

  const s =
    d -
    Date.now();


  if (
    s <= 0
  ) {
    return [
      'Completed',
      'done'
    ];
  }


  const m =
    (s / 60000) | 0;

  const h =
    (m / 60) | 0;

  const dd =
    (h / 24) | 0;


  return dd >= 1
    ? [
        dd +
          ' day' +
          (dd > 1
            ? 's'
            : '') +
          ' left',

        dd < 3
          ? 'warn'
          : 'ok'
      ]

    : h >= 1
      ? [
          h +
            'h ' +
            (m % 60) +
            'm left',

          'crit'
        ]

      : [
          m +
            ' min left',

          'crit'
        ];
}


/*
 * ============================================================
 * URL LABEL
 * ============================================================
 */

const label = u => {

  try {

    const h =
      new URL(u)
        .hostname;


    return /forms|docs\.google/.test(
      h
    )
      ? 'Form'
      : h.replace(
          /^www\./,
          ''
        );

  } catch (
    e
  ) {

    return 'Link';
  }
};


/*
 * ============================================================
 * INSTALLATION ID
 * ============================================================
 */

async function getInstallationId() {

  const existing =
    await chrome.storage.local.get(
      'installation_id'
    );


  if (
    existing.installation_id &&
    typeof existing.installation_id ===
      'string'
  ) {

    return (
      existing.installation_id
    );
  }


  const installationId =
    'kgp_install_' +
    crypto.randomUUID();


  await chrome.storage.local.set({
    installation_id:
      installationId
  });


  return installationId;
}


/*
 * ============================================================
 * INSTALLATION CREDENTIALS
 * ============================================================
 *
 * installation_id alone used to be enough to call the Worker.
 * It is not a secret — it sits in storage, in the /checkout URL
 * and in Cashfree's customer_id — so every installation now
 * also carries a random secret issued at registration.
 *
 * Returns { installation_id, install_secret } or null when this
 * browser has no usable registration yet.
 * ============================================================
 */

const INSTALL_SECRET_PATTERN =
  /^[0-9a-f]{64}$/;


async function registerInstallation(
  installationId
) {

  return await fetch(
    `${API_BASE}/register-installation`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json'
      },

      body:
        JSON.stringify({
          installation_id:
            installationId
        })
    }
  );
}


async function getInstallationCredentials() {

  const stored =
    await chrome.storage.local.get({

      installation_id:
        null,

      install_secret:
        null,

      install_secret_recheck_after:
        0
    });


  if (
    stored.installation_id &&
    INSTALL_SECRET_PATTERN.test(
      stored.install_secret || ''
    )
  ) {

    return {
      installation_id:
        stored.installation_id,

      install_secret:
        stored.install_secret
    };
  }


  /*
   * Re-registering is rate limited server-side (20/hour/IP), so
   * do not retry on every render — back off for an hour.
   */

  if (
    Date.now() <
    Number(
      stored.install_secret_recheck_after ||
      0
    )
  ) {

    return null;
  }


  /*
   * Reuse the existing installation_id when there is one.
   *
   * Installations that predate secrets are already linked to a
   * license in the database, and the /verify-license and
   * /restore-license lookups are keyed on this id. Minting a new
   * one here would orphan an existing PRO licence and force a
   * restore.
   */

  /*
   * The id the server issued a secret for. Tracked separately so
   * the stored pair can never mix an old id with a new secret.
   */

  let registeredId =
    await getInstallationId();


  try {

    let response =
      await registerInstallation(
        registeredId
      );


    let data =
      await response
        .json()
        .catch(() => ({}));


    /*
     * ALREADY_REGISTERED means the database still holds a secret
     * for this id but we no longer have it (storage cleared, or a
     * reinstall over an existing profile).
     *
     * We cannot recover the old secret — the server only stores a
     * hash — so abandon this id and register a new installation.
     * A PRO license is recovered afterwards through Restore PRO,
     * which is keyed on the verified email rather than the
     * installation.
     */

    if (
      response.status === 409 ||
      data?.code ===
        'ALREADY_REGISTERED'
    ) {

      registeredId =
        'kgp_install_' +
        crypto.randomUUID();


      response =
        await registerInstallation(
          registeredId
        );


      data =
        await response
          .json()
          .catch(() => ({}));
    }


    if (
      !response.ok ||
      !INSTALL_SECRET_PATTERN.test(
        data?.install_secret || ''
      )
    ) {

      /*
       * A 404 here means the deployed Worker predates
       * /register-installation. That is a deployment problem, not
       * a connectivity one, and waiting an hour will not fix it.
       */

      const serverOutdated =
        response.status === 404;


      const error =
        new Error(
          serverOutdated
            ? 'The license server does not expose /register-installation (outdated deployment).'
            : data?.error ||
              `Registration failed: ${response.status}`
        );


      error.serverOutdated =
        serverOutdated;


      throw error;
    }


    const credentials = {

      installation_id:
        data.installation_id ||
        registeredId,

      install_secret:
        data.install_secret
    };


    await chrome.storage.local.set({

      ...credentials,

      /*
       * A fresh installation starts life not-PRO. Any leftover
       * entitlement from a previous registration must not carry
       * over.
       */

      pro:
        false,

      license_token:
        null,

      license_status:
        'UNKNOWN',

      license_checked_at:
        0,

      install_secret_recheck_after:
        0
    });


    return credentials;

  } catch (
    error
  ) {

    console.error(
      'Installation registration failed:',
      error
    );


    /*
     * Back off only when retrying could actually help. Muting the
     * client for an hour on a 404 would hide a deploy problem
     * behind "check your connection" and show no request leaving,
     * which is exactly the misleading symptom this caused.
     */

    if (
      !error?.serverOutdated
    ) {

      await chrome.storage.local.set({

        install_secret_recheck_after:
          Date.now() +
          60 * 60 * 1000
      });
    }


    await chrome.storage.local.set({

      last_registration_error:
        error?.serverOutdated
          ? 'server_outdated'
          : 'unreachable'
    });


    return null;
  }
}


/*
 * ============================================================
 * LICENSE CACHE READ
 * ============================================================
 */

async function getLicenseCache() {

  return await chrome.storage.local.get({

    pro:
      false,

    license_token:
      null,

    license_status:
      'UNKNOWN',

    license_checked_at:
      0,

    purchase_in_progress:
      false,

    purchase_started_at:
      0

  });
}


/*
 * ============================================================
 * LICENSE VERIFICATION
 * ============================================================
 */

async function verifyLicense(
  force = false
) {

  const cached =
    await getLicenseCache();


  const now =
    Date.now();


  /*
   * Resolve credentials first: a gate that only trusts a stored
   * boolean would otherwise let anyone unlock PRO by writing
   * chrome.storage.local.pro = true.
   */

  const credentials =
    await getInstallationCredentials();


  if (!credentials) {

    return {

      pro:
        false,

      status:
        'UNKNOWN',

      fromCache:
        false
    };
  }


  const installationId =
    credentials.installation_id;


  const cacheFresh =
    cached.license_checked_at >
      0 &&

    now -
      cached.license_checked_at <
      LICENSE_CACHE_MS;


  const purchaseFresh =
    cached.purchase_in_progress ===
      true &&

    cached.purchase_started_at >
      0 &&

    now -
      cached.purchase_started_at <
      PURCHASE_FORCE_VERIFY_MS;


  /*
   * Use the local cache only when it carries a token that still
   * verifies. The crypto check is what makes the cache safe to
   * trust — a tampered storage value simply fails verification.
   */

  if (
    !force &&
    cacheFresh &&
    !purchaseFresh
  ) {

    const tokenValid =
      await verifyLicenseToken(
        cached.license_token,
        installationId
      );


    if (tokenValid) {

      return {

        pro:
          true,

        status:
          cached.license_status ||
          'ACTIVE',

        fromCache:
          true
      };
    }


    /*
     * Cached value is unusable — fall through to the server. We
     * never return a stale `true` from here.
     */
  }


  try {

    const response =
      await fetch(
        `${API_BASE}/verify-license`,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              installation_id:
                installationId,

              install_secret:
                credentials.install_secret
            })
        }
      );


    if (
      !response.ok
    ) {

      throw new Error(
        `License verification failed: ${response.status}`
      );
    }


    const data =
      await response.json();


    /*
     * PRO requires all three: a successful call, pro === true,
     * and a signature-valid token minted for this installation.
     */

    const isPro =
      data.success === true &&

      data.pro === true &&

      data.status === 'ACTIVE' &&

      (await verifyLicenseToken(
        data.license_token,
        installationId
      ));


    await chrome.storage.local.set({

      pro:
        isPro,

      license_token:
        isPro
          ? data.license_token
          : null,

      license_status:
        data.status ||
        'UNKNOWN',

      license_checked_at:
        Date.now(),

      ...(isPro
        ? {

            purchase_in_progress:
              false,

            purchase_started_at:
              0

          }

        : {})

    });


    return {

      pro:
        isPro,

      status:
        data.status ||
        'UNKNOWN',

      fromCache:
        false
    };

  } catch (
    error
  ) {

    console.error(
      'License verification error:',
      error
    );


    /*
     * The Worker is unreachable.
     *
     * This used to replay the last known `pro` value for 24 hours,
     * which meant anyone could unlock PRO permanently just by
     * blocking the API. It now fails closed: we honour a cached
     * positive only while the signed token is still valid, and
     * otherwise report not-PRO.
     */

    const offlineValid =
      cached.pro === true &&
      (await verifyLicenseToken(
        cached.license_token,
        installationId
      ));


    return {

      pro:
        offlineValid,

      status:
        offlineValid
          ? cached.license_status ||
            'ACTIVE'
          : 'UNKNOWN',

      fromCache:
        true
    };
  }
}


/*
 * ============================================================
 * START CASHFREE CHECKOUT
 * ============================================================
 */

async function startProCheckout() {

  try {

    const credentials =
      await getInstallationCredentials();


    if (!credentials) {

      /*
       * getInstallationCredentials() stores why it failed. Say so
       * instead of always blaming the network: an outdated Worker
       * is not something "check your connection" can fix.
       */

      const {
        last_registration_error:
          reason
      } =
        await chrome.storage.local.get(
          'last_registration_error'
        );


      alert(
        reason ===
          'server_outdated'

          ? 'The license server is running an outdated version that is missing the registration endpoint. There is no request the extension can make until the backend is redeployed.'

          : 'Could not reach the license server. Please check your connection and try again.'
      );

      return;
    }


    /*
     * Tell popup that a purchase is in progress.
     * This causes fresh license checks when popup
     * is opened again after payment.
     */

    await chrome.storage.local.set({

      purchase_in_progress:
        true,

      purchase_started_at:
        Date.now()

    });


    /*
     * The secret travels in the URL fragment, which is never sent
     * to the server and never appears in Referer.
     */

    const checkoutUrl =
      `${API_BASE}/checkout?installation_id=${encodeURIComponent(
        credentials.installation_id
      )}#s=${credentials.install_secret}`;


    await chrome.tabs.create({
      url:
        checkoutUrl
    });

  } catch (
    error
  ) {

    console.error(
      'Could not start PRO checkout:',
      error
    );


    await chrome.storage.local.set({

      purchase_in_progress:
        false,

      purchase_started_at:
        0

    });


    alert(
      'Unable to start PRO checkout. Please try again.'
    );
  }
}


/*
 * ============================================================
 * CHECKBOX STORAGE
 * ============================================================
 */

async function getCheckedState() {

  const data =
    await chrome.storage.local.get({

      checkedNotices:
        {}

    });


  return (
    data.checkedNotices ||
    {}
  );
}


async function setCheckedState(
  key,
  checked
) {

  const data =
    await chrome.storage.local.get({

      checkedNotices:
        {}

    });


  const checkedNotices = {

    ...(
      data.checkedNotices ||
      {}
    )

  };


  if (
    checked
  ) {

    checkedNotices[key] =
      true;

  } else {

    delete checkedNotices[
      key
    ];
  }


  await chrome.storage.local.set({

    checkedNotices

  });
}


/*
 * ============================================================
 * FORMS
 * ============================================================
 */

function renderForms(
  x,
  isPro
) {

  if (
    !isPro
  ) {

    return (
      '<span class="locked">PRO</span>'
    );
  }


  return x.u.map(
    u =>
      `<a target="_blank" href="${esc(
        u
      )}">${esc(
        label(u)
      )}</a>`
  )
  .join('')

  || '<small>see notice</small>';
}


/*
 * ============================================================
 * TIME LEFT
 * ============================================================
 */

function renderTimeLeft(
  x,
  isPro
) {

  if (
    !isPro
  ) {

    return (
      '<span class="locked">PRO</span>'
    );
  }


  const [
    l,
    c
  ] =
    left(x.d);


  return `
    <span class="${c}">
      ${l}
    </span>
  `;
}


/*
 * ============================================================
 * TABLE
 * ============================================================
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
      .filter(
        x =>
          x.d >
          now
      )
      .sort(
        (a, b) =>
          a.d -
          b.d
      );


  const dn =
    list
      .filter(
        x =>
          x.d <=
          now
      )
      .sort(
        (a, b) =>
          b.d -
          a.d
      )
      .slice(
        0,
        8
      );


  const rows =
    [
      ...up,
      ...dn
    ]
      .map(
        x => {

          const checkboxKey =
            `${x.type}:${x.id}`;


          const isChecked =
            checkedNotices[
              checkboxKey
            ] === true;


          const [
            deadlineDate,
            deadlineTime
          ] =
            x.d
              .toLocaleString(
                'en-IN',
                {
                  day:
                    'numeric',

                  month:
                    'short',

                  hour:
                    'numeric',

                  minute:
                    '2-digit'
                }
              )
              .split(
                ', '
              );


          return `

            <tr
              class="
                ${x.d <= now ? 'd ' : ''}
                ${
                  isChecked
                    ? 'checked-row'
                    : ''
                }
              "
            >

              <td class="check-cell">

                ${
                  isPro

                    ? `

                      <input
                        type="checkbox"
                        class="notice-check"
                        data-key="${esc(
                          checkboxKey
                        )}"
                        ${
                          isChecked
                            ? 'checked'
                            : ''
                        }
                        aria-label="Mark ${esc(
                          x.company
                        )} as completed"
                      >

                    `

                    : `
                      <span class="locked">
                        PRO
                      </span>
                    `
                }

              </td>


              <td>

                ${esc(
                  x.company
                )}

                <br>

                <small>
                  ${esc(
                    x.subject
                  )}
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
        }
      )
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
 * ============================================================
 * RESTORE MODAL STYLES
 * ============================================================
 */

function ensureRestoreModalStyles() {

  if (
    document.getElementById(
      'restoreModalStyles'
    )
  ) {

    return;
  }


  const style =
    document.createElement(
      'style'
    );


  style.id =
    'restoreModalStyles';


  style.textContent = `

    .restore-overlay {

      position: fixed;

      inset: 0;

      z-index: 9999;

      background:
        rgba(
          15,
          23,
          42,
          .48
        );

      display: flex;

      align-items: center;

      justify-content: center;

      padding: 18px;

    }


    .restore-card {

      width:
        min(
          92%,
          420px
        );

      background:
        #fff;

      border-radius:
        16px;

      padding:
        20px;

      box-shadow:
        0
        18px
        50px
        rgba(
          0,
          0,
          0,
          .22
        );

    }


    .restore-card h2 {

      margin:
        0 0 8px;

      font-size:
        20px;

    }


    .restore-card p {

      margin:
        7px 0;

      color:
        #667085;

      line-height:
        1.45;

    }


    .restore-card label {

      display:
        block;

      margin:
        14px 0 6px;

      font-weight:
        700;

      font-size:
        12px;

    }


    .restore-card input {

      width:
        100%;

      box-sizing:
        border-box;

      padding:
        10px 11px;

      border:
        1px solid #cbd5e1;

      border-radius:
        9px;

      font-size:
        14px;

      outline:
        none;

    }


    .restore-card input:focus {

      border-color:
        #6366f1;

      box-shadow:
        0
        0
        0
        3px
        rgba(
          99,
          102,
          241,
          .12
        );

    }


    .restore-buttons {

      display:
        flex;

      gap:
        8px;

      margin-top:
        14px;

    }


    .restore-buttons button {

      flex:
        1;

      margin-top:
        0;

    }


    .restore-primary {

      background:
        linear-gradient(
          135deg,
          #2563eb,
          #7c3aed
        ) !important;

      color:
        #fff !important;

      border-color:
        transparent !important;

    }


    .restore-secondary {

      background:
        #f8fafc !important;

    }


    .restore-status {

      min-height:
        18px;

      margin-top:
        10px;

      font-size:
        12px;

      color:
        #475467;

    }


    .restore-status.error {

      color:
        #dc2626;

    }


    .restore-status.success {

      color:
        #16a34a;

    }


    .restore-otp {

      display:
        none;

    }


    .restore-otp.visible {

      display:
        block;

    }

  `;


  document.head.appendChild(
    style
  );
}


/*
 * ============================================================
 * CLOSE RESTORE MODAL
 * ============================================================
 */

function closeRestoreModal() {

  document
    .getElementById(
      'restoreOverlay'
    )
    ?.remove();
}


/*
 * ============================================================
 * RESTORE PRO
 * ============================================================
 */
async function getRestoreState() {
  const data =
    await chrome.storage.local.get(
      RESTORE_STORAGE_KEY
    );

  const state =
    data[RESTORE_STORAGE_KEY];

  if (
    !state ||
    typeof state !== 'object'
  ) {
    return null;
  }

  if (
    !state.email ||
    state.stage !== 'otp' ||
    !state.sentAt
  ) {
    return null;
  }

  const age =
    Date.now() -
    state.sentAt;

  if (
    age < 0 ||
    age > RESTORE_STATE_MAX_AGE_MS
  ) {
    await clearRestoreState();
    return null;
  }

  return state;
}


async function setRestoreState(
  state
) {
  await chrome.storage.local.set({
    [RESTORE_STORAGE_KEY]:
      state
  });
}


async function clearRestoreState() {
  await chrome.storage.local.remove(
    RESTORE_STORAGE_KEY
  );
}

async function restorePro(
  resume = false
) {

  ensureRestoreModalStyles();


  if (
    document.getElementById(
      'restoreOverlay'
    )
  ) {
    return;
  }


  const savedState =
    await getRestoreState();


  const shouldResume =
    resume &&
    savedState;


  const overlay =
    document.createElement(
      'div'
    );


  overlay.id =
    'restoreOverlay';

  overlay.className =
    'restore-overlay';


  overlay.innerHTML = `

    <div class="restore-card">

      <h2>
        Restore PRO
      </h2>

      <p>
        Verify the email used
        for your PRO purchase
        to link this browser
        to your existing license.
      </p>


      <label
        for="restoreEmail"
      >
        Email
      </label>


      <input
        id="restoreEmail"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
        value="${
          shouldResume
            ? esc(savedState.email)
            : ''
        }"
      >


      <div class="restore-buttons">

        <button
          id="restoreSendOtp"
          class="restore-primary"
        >
          ${
            shouldResume
              ? 'Send New OTP'
              : 'Send OTP'
          }
        </button>


        <button
          id="restoreClose"
          class="restore-secondary"
        >
          Cancel
        </button>

      </div>


      <div
        id="restoreOtpSection"
        class="restore-otp ${
          shouldResume
            ? 'visible'
            : ''
        }"
      >

        <label
          for="restoreOtp"
        >
          Verification code
        </label>


        <input
          id="restoreOtp"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="8"
          placeholder="Enter code"
        >


        <div class="restore-buttons">

          <button
            id="restoreVerify"
            class="restore-primary"
          >
            Verify & Restore PRO
          </button>


          <button
            id="restoreResend"
            class="restore-secondary"
          >
            ${
              shouldResume
                ? 'Resend OTP'
                : 'Resend OTP'
            }
          </button>

        </div>

      </div>


      <div
        id="restoreStatus"
        class="restore-status"
      >
        ${
          shouldResume
            ? 'Enter the OTP sent to your email.'
            : ''
        }
      </div>

    </div>

  `;


  document.body.appendChild(
    overlay
  );


  const emailInput =
    document.getElementById(
      'restoreEmail'
    );


  const otpInput =
    document.getElementById(
      'restoreOtp'
    );


  const sendButton =
    document.getElementById(
      'restoreSendOtp'
    );


  const verifyButton =
    document.getElementById(
      'restoreVerify'
    );


  const resendButton =
    document.getElementById(
      'restoreResend'
    );


  const closeButton =
    document.getElementById(
      'restoreClose'
    );


  const otpSection =
    document.getElementById(
      'restoreOtpSection'
    );


  const statusBox =
    document.getElementById(
      'restoreStatus'
    );


  let lastSentEmail =
    shouldResume
      ? savedState.email
      : '';


  let resendTimer =
    null;


  function setStatus(
    text,
    kind = ''
  ) {

    statusBox.textContent =
      text;

    statusBox.className =
      `restore-status ${kind}`;
  }


  function validEmail(
    email
  ) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(
        email
      );
  }


  function validOtp(
    token
  ) {

    return /^\d{6,10}$/
      .test(
        token
      );
  }


  function startResendCountdown(
    seconds
  ) {

    clearInterval(
      resendTimer
    );


    let remaining =
      Math.max(
        0,
        Math.ceil(
          seconds
        )
      );


    if (
      remaining <= 0
    ) {

      resendButton.disabled =
        false;

      resendButton.textContent =
        'Resend OTP';

      return;
    }


    resendButton.disabled =
      true;


    resendButton.textContent =
      `Resend in ${remaining}s`;


    resendTimer =
      setInterval(
        () => {

          remaining -= 1;


          if (
            remaining <= 0
          ) {

            clearInterval(
              resendTimer
            );


            resendTimer =
              null;


            resendButton.disabled =
              false;


            resendButton.textContent =
              'Resend OTP';


            return;
          }


          resendButton.textContent =
            `Resend in ${remaining}s`;

        },
        1000
      );
  }


  async function sendOtp() {

    const email =
      emailInput.value
        .trim()
        .toLowerCase();


    if (
      !validEmail(
        email
      )
    ) {

      setStatus(
        'Please enter a valid email address.',
        'error'
      );

      return;
    }


    sendButton.disabled =
      true;

    resendButton.disabled =
      true;


    setStatus(
      'Sending verification code...'
    );


    try {

      const response =
        await fetch(
          `${SUPABASE_URL}/auth/v1/otp`,
          {
            method:
              'POST',

            headers: {

              apikey:
                SUPABASE_PUBLISHABLE_KEY,

              'Content-Type':
                'application/json'

            },

            body:
              JSON.stringify({

                email:
                  email,

                create_user:
                  true

              })
          }
        );


      const data =
        await response
          .json()
          .catch(
            () => ({})
          );


      if (
        !response.ok
      ) {

        throw new Error(

          data?.msg ||

          data?.message ||

          data?.error_description ||

          'Could not send OTP.'

        );
      }


      const sentAt =
        Date.now();


      lastSentEmail =
        email;


      /*
       * IMPORTANT:
       * Persist the OTP-flow state.
       *
       * We do NOT store the OTP itself.
       */

      await setRestoreState({

        stage:
          'otp',

        email:
          email,

        sentAt:
          sentAt

      });


      otpSection
        .classList
        .add(
          'visible'
        );


      otpInput.focus();


      setStatus(
        'OTP sent. Check your email and enter the verification code.',
        'success'
      );


      startResendCountdown(
        60
      );


    } catch (
      error
    ) {

      console.error(
        'Supabase OTP send failed:',
        error
      );


      setStatus(

        error.message ||

        'Could not send OTP.',

        'error'

      );


      resendButton.disabled =
        false;

    } finally {

      sendButton.disabled =
        false;
    }
  }


  async function verifyAndRestore() {

    const email =
      emailInput.value
        .trim()
        .toLowerCase();


    const token =
      otpInput.value
        .trim();


    if (
      !validEmail(
        email
      ) ||
      email !==
        lastSentEmail
    ) {

      setStatus(
        'Use the same email address that received the OTP.',
        'error'
      );

      return;
    }


    if (
      !validOtp(
        token
      )
    ) {

      setStatus(
        'Enter the verification code from the email.',
        'error'
      );

      return;
    }


    verifyButton.disabled =
      true;

    resendButton.disabled =
      true;


    setStatus(
      'Verifying email and restoring PRO...'
    );


    try {

      const supabaseResponse =
  await fetch(
    `${SUPABASE_URL}/auth/v1/verify`,
    {
      method:
        'POST',

      headers: {

        apikey:
          SUPABASE_PUBLISHABLE_KEY,

        'Content-Type':
          'application/json'

      },

      body:
        JSON.stringify({

          email:
            email,

          token:
            token,

          type:
            'email'

        })
    }
  );


      const supabaseData =
        await supabaseResponse
          .json()
          .catch(
            () => ({})
          );


      if (
        !supabaseResponse.ok ||
        !supabaseData.access_token
      ) {

        throw new Error(

          supabaseData?.msg ||

          supabaseData?.message ||

          supabaseData?.error_description ||

          'Invalid or expired OTP.'

        );
      }


      /*
       * Get the current browser installation.
       */

      const credentials =
        await getInstallationCredentials();


      if (!credentials) {

        throw new Error(
          'Could not reach the license server. Please try again.'
        );
      }


      /*
       * Let the Worker verify the Supabase
       * token and link the license.
       */

      const restoreResponse =
        await fetch(
          `${API_BASE}/restore-license`,
          {
            method:
              'POST',

            headers: {

              'Content-Type':
                'application/json',

              Authorization:
                `Bearer ${supabaseData.access_token}`

            },

            body:
              JSON.stringify({

                installation_id:
                  credentials.installation_id,

                install_secret:
                  credentials.install_secret

              })

          }
        );


      const restoreData =
        await restoreResponse
          .json()
          .catch(
            () => ({})
          );


      if (
        !restoreResponse.ok ||
        restoreData.pro !== true
      ) {

        throw new Error(

          restoreData?.error ||

          'No active PRO license was found for this email.'

        );
      }


      /*
       * Successfully restored.
       *
       * Trust it only if the Worker's token verifies — the same
       * check verifyLicense() performs.
       */

      const restoreTokenValid =
        await verifyLicenseToken(
          restoreData.license_token,
          credentials.installation_id
        );


      if (!restoreTokenValid) {

        throw new Error(
          'Could not verify the restored license. Please try again.'
        );
      }


      /*
       * Clear the pending OTP state.
       */

      await clearRestoreState();


      await chrome.storage.local.set({

        pro:
          true,

        license_token:
          restoreData.license_token,

        license_status:
          'ACTIVE',

        license_checked_at:
          Date.now(),

        purchase_in_progress:
          false,

        purchase_started_at:
          0

      });


      setStatus(
        'PRO restored successfully on this browser.',
        'success'
      );


      setTimeout(
        () => {

          closeRestoreModal();

          render(
            true
          );

        },
        700
      );


    } catch (
      error
    ) {

      console.error(
        'PRO restore failed:',
        error
      );


      setStatus(

        error.message ||

        'Could not restore PRO.',

        'error'

      );


      verifyButton.disabled =
        false;


      resendButton.disabled =
        false;
    }
  }


  sendButton.addEventListener(
    'click',
    sendOtp
  );


  verifyButton.addEventListener(
    'click',
    verifyAndRestore
  );


  resendButton.addEventListener(
    'click',
    sendOtp
  );


  closeButton.addEventListener(
    'click',
    async () => {

      clearInterval(
        resendTimer
      );

      await clearRestoreState();

      closeRestoreModal();
    }
  );


  overlay.addEventListener(
    'click',
    event => {

      if (
        event.target ===
        overlay
      ) {

        /*
         * Clicking outside behaves like
         * closing the dialog intentionally.
         */

        clearInterval(
          resendTimer
        );

        clearRestoreState();

        closeRestoreModal();
      }
    }
  );


  otpInput.addEventListener(
    'input',
    () => {

      otpInput.value =
        otpInput.value
          .replace(
            /\D/g,
            ''
          );

    }
  );


  /*
   * Resume the resend countdown after the popup
   * has been reopened.
   */

  if (
    shouldResume
  ) {

    const elapsed =
      (
        Date.now() -
        savedState.sentAt
      ) / 1000;


    startResendCountdown(
      60 -
        elapsed
    );


    setTimeout(
      () => {

        otpInput.focus();

      },
      100
    );
  }
}


/*
 * ============================================================
 * UPGRADE / PRO STATUS
 * ============================================================
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


  /*
   * PRO UI
   */

  if (
    isPro
  ) {

    plan.textContent =
      'PRO';


    plan.className =
      'plan pro';


    upgrade.innerHTML = `

      <div
        class="upgrade"
      >

        <div
          class="upgrade-title"
        >
          PRO is active
        </div>


        <div
          class="upgrade-text"
        >
          Time remaining,
          application links
          and Done tracking
          are unlocked.
        </div>

      </div>

    `;


    return;
  }


  /*
   * FREE UI
   */

  plan.textContent =
    'FREE';


  plan.className =
    'plan free';


  let statusText =

    'Free users can see company names and deadlines. PRO unlocks time remaining, application links and Done tracking.';


  if (
    status ===
    'PENDING'
  ) {

    statusText =

      'A PRO payment is pending. Complete the payment and wait for confirmation.';
  }


  upgrade.innerHTML = `

    <div
      class="upgrade"
    >

      <div
        class="upgrade-title"
      >
        Unlock PRO
      </div>


      <div
        class="upgrade-text"
      >
        ${statusText}
      </div>


      <button
        id="upgradeButton"
      >
        Unlock PRO
      </button>


      <button
        id="restoreButton"
      >
        Restore PRO
      </button>

    </div>

  `;


  document
    .getElementById(
      'upgradeButton'
    )
    ?.addEventListener(
      'click',
      startProCheckout
    );


  document
    .getElementById(
      'restoreButton'
    )
    ?.addEventListener(
      'click',
      restorePro
    );
}


/*
 * ============================================================
 * CHECKBOX EVENT HANDLERS
 * ============================================================
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
            event.target
              .dataset
              .key;


          const checked =
            event.target
              .checked;


          try {

            await setCheckedState(
              key,
              checked
            );


            const row =
              event.target.closest(
                'tr'
              );


            if (
              row
            ) {

              row.classList.toggle(
                'checked-row',
                checked
              );
            }

          } catch (
            error
          ) {

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
 * ============================================================
 * MAIN RENDER
 * ============================================================
 */

async function render(
  forceLicenseCheck = false
) {

  const license =
    await verifyLicense(
      forceLicenseCheck
    );


  const isPro =
    license.pro ===
    true;


  const checkedNotices =
    await getCheckedState();


  chrome.storage.local.get(

    {
      n:
        {},

      t:
        0
    },


    ({
      n,
      t
    }) => {

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


      /*
       * Information section.
       */

      if (
        info
      ) {

        info.innerHTML =
          t

            ? `

              <small>

                ${
                  Object.keys(
                    n
                  ).length
                }

                notices scanned ·

                last sync

                ${
                  new Date(
                    t
                  ).toLocaleString()
                }

              </small>

            `

            : `

              <b>
                No data yet.
              </b>

              Open ERP →
              CDC →
              Notice Board once.

            `;
      }


      /*
       * Tables.
       */

      if (
        out
      ) {

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


        attachCheckboxHandlers();
      }

    }

  );
}


/*
 * ============================================================
 * INITIAL RENDER
 * ============================================================
 */

render(
  false
);


/*
 * ============================================================
 * POPUP UI REFRESH
 * ============================================================
 *
 * The popup still refreshes every 30 seconds while open,
 * but verifyLicense() normally uses the 6-hour cache.
 *
 * ============================================================
 */

setInterval(
  () => {

    render(
      false
    );

  },

  30000
);