# KGP Fill The Form

KGP Fill The Form is a Chrome/Edge extension for IIT Kharagpur students to monitor placement and internship notices from the ERP notice board and keep track of relevant application links and deadlines in one place.

This project does not submit forms or log into ERP for you. It works with the user’s existing ERP session and reads notice-board data already available in the browser.

## What the extension does

The extension:

- watches ERP notice-board requests on the IIT KGP ERP pages
- captures placement and internship notices from XML data returned by the ERP
- extracts company name, subject, notice text, and notice ID
- looks through each notice for links to application forms or related documents
- parses likely deadlines from notice text, such as dates and times like “by 5:00 pm” or “20 Jan 2025”
- filters out irrelevant notices like result, shortlist, schedule, or PPO-related entries
- stores the latest notices in Chrome local storage
- shows the collected opportunities in a popup dashboard grouped by placement and internship
- sorts items by how soon the deadline is approaching

## Project status

🚧 Early development

The extension is functional as a lightweight tracker, but it is still being refined. It focuses on extracting and organizing potentially relevant notices rather than automating the whole application workflow.

## How it works

### 1) Notice capture

The content script in [hook.js](hook.js) patches the browser’s XMLHttpRequest behavior. When ERP loads XML notice data, it checks whether the response looks like a notice board table and then parses rows into structured objects.

It ignores unrelated responses and only keeps placement/internship rows that match the current ERP notice format.

### 2) Message relay

The script in [relay.js](relay.js) listens for messages from the page context and saves the captured rows to `chrome.storage.local`.

### 3) Parsing and filtering

The logic in [parse.js](parse.js) does the heavy lifting:

- extracts URL candidates from notice text
- removes noisy trailing text from Google Form links and other URLs
- identifies whether a notice is relevant
- computes a deadline from date/time patterns in the notice body
- groups notices by type and company to keep only the newest relevant entry for each company pattern

### 4) Popup dashboard

The popup UI in [popup.html](popup.html) and [popup.js](popup.js) reads stored notices and renders two tables:

- Placement
- Internship

Each row includes:

- company name
- notice subject
- deadline
- time remaining
- clickable link(s) extracted from the notice

## Architecture overview

```text
IIT KGP ERP notice board
        ↓
hook.js (page context XHR/response capture)
        ↓
relay.js (store captured notices in Chrome storage)
        ↓
parse.js (extract URLs, deadlines, and relevant notices)
        ↓
popup.js (render dashboard in extension popup)
        ↓
Chrome local storage + popup UI
```

## Files in this project

- [manifest.json](manifest.json) – defines the extension and its permissions
- [hook.js](hook.js) – captures and forwards ERP notice data from the page context
- [relay.js](relay.js) – saves the data into browser storage
- [parse.js](parse.js) – parses the notice data and extracts deadlines/links
- [popup.html](popup.html) – popup layout
- [popup.js](popup.js) – dashboard rendering and sorting logic
- [README.md](README.md) – project documentation

## Installation

1. Open Chrome or Edge and go to `chrome://extensions` (or `edge://extensions`).
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder.
5. Visit the ERP pages at:
   - `https://erp.iitkgp.ac.in/*`
   - `https://erp.iitkgp.ernet.in/*`
6. Open the ERP CDC notice board or relevant placement/internship notices while logged in.
7. Click the extension icon to view the tracked opportunities.

## Important behavior and limitations

- The extension only works on the ERP domains listed in [manifest.json](manifest.json).
- It does not auto-refresh the notice board on its own; it captures data when the ERP page loads notices.
- The deadline parser is best-effort. It tries to detect common formats from notice text, but unusual wording may not be parsed perfectly.
- It filters notices heuristically. Some entries may be skipped if they are not clearly form-related or if the notice format differs from expected ERP data.
- It stores only the notice metadata and extracted links in browser storage, not usernames or passwords.

## Privacy notes

This extension is designed to work with the user’s existing authenticated ERP session.

It does not store ERP credentials. The data it keeps is local to the browser via Chrome local storage and consists of notice information the page already exposes, such as:

- notice ID
- entry type (`PLACEMENT` or `INTERNSHIP`)
- subject
- company information
- extracted links
- parsed deadline

## .env note

This project does not currently depend on a `.env` file.

The repository includes a `.env` file only as a leftover placeholder, and it is intentionally not used by the browser extension. Chrome extensions run entirely in the browser, so environment variables are not normally used here.

## License

TBD