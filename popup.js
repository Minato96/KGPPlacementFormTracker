const API_BASE =
  'https://kgp-placement-form-tracker-backend.noticeboard.workers.dev';

const SUPABASE_URL =
  'https://clgjswrlcwzmdxhhegtk.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_feaDD3pJrMCv-BPxmxuFYQ_1IW1wK-3';


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
 * LICENSE CACHE READ
 * ============================================================
 */

async function getLicenseCache() {

  return await chrome.storage.local.get({

    pro:
      false,

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
   * Use local cache unless a fresh purchase
   * needs verification.
   */

  if (
    !force &&
    cacheFresh &&
    !purchaseFresh
  ) {

    return {

      pro:
        cached.pro === true,

      status:
        cached.license_status ||
        'UNKNOWN',

      fromCache:
        true
    };
  }


  try {

    const installationId =
      await getInstallationId();


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
                installationId
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


    const isPro =
      data.success === true &&

      data.pro === true &&

      data.status ===
        'ACTIVE';


    await chrome.storage.local.set({

      pro:
        isPro,

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


    const fallback =
      await getLicenseCache();


    const fallbackAge =
      fallback.license_checked_at >
        0

        ? Date.now() -
          fallback.license_checked_at

        : Infinity;


    /*
     * Temporary Worker outage:
     * allow the last known state for 24 hours.
     */

    if (
      fallbackAge <=
      24 * 60 * 60 * 1000
    ) {

      return {

        pro:
          fallback.pro === true,

        status:
          fallback.license_status ||
          'UNKNOWN',

        fromCache:
          true
      };
    }


    return {

      pro:
        false,

      status:
        'UNKNOWN',

      fromCache:
        false
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

    const installationId =
      await getInstallationId();


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


    const checkoutUrl =
      `${API_BASE}/checkout?installation_id=${encodeURIComponent(
        installationId
      )}`;


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

      const installationId =
        await getInstallationId();


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
                  installationId

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
       * Clear the pending OTP state.
       */

      await clearRestoreState();


      await chrome.storage.local.set({

        pro:
          true,

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