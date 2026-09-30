# KGP Fill the Form

KGP Fill the Form is a browser extension for IIT Kharagpur students that scans the ERP notice board for placement and internship opportunities, extracts useful links and deadlines, and shows them in a small popup dashboard.

## How to use it

### 1) Load the extension in Chrome or Edge

1. Open your browser and go to:
   - `chrome://extensions` in Chrome
   - `edge://extensions` in Edge
2. Turn on Developer mode.
3. Click the `Load unpacked` button.
4. Select the project folder containing this extension files.
5. The extension icon should appear in the browser toolbar.

### 2) Open the ERP and log in

Visit the IIT KGP ERP pages while you are signed in:

- `https://erp.iitkgp.ac.in/`
- `https://erp.iitkgp.ernet.in/`

Then open the CDC notice board or placement/internship notice pages where the relevant notices are listed.

### 3) Let the extension collect notices

Once the ERP page loads its notice data, the extension listens to the page requests and captures relevant notice rows automatically.

It looks for placement and internship entries, extracts links and deadlines, and stores the information locally in the browser.

### 4) Open the extension popup

Click the extension icon in the toolbar to open the popup.

You will see a dashboard with two sections:

- Placement
- Internship

Each item shows:

- company name
- notice subject
- deadline
- time remaining
- extracted application links

### 5) Use it while checking ERP notices

The extension works best when you browse ERP notices normally. As new notices appear, the popup updates with the latest collected data from the current browser session.

> Note: the extension depends on the ERP pages being available in the browser and uses the user’s existing login session. It does not store your ERP credentials.

## Features

- Monitors ERP notices for placement and internship opportunities
- Extracts links from notice text
- Tries to detect deadlines from the notice content
- Filters relevant notices from unrelated updates
- Groups notices into placement and internship sections
- Shows everything in a popup dashboard

## Privacy

The extension stores collected notice data in the browser’s local storage only. It does not save your ERP username, password, or authentication tokens.

