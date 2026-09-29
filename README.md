# KGP Fill The Form

A browser extension for IIT Kharagpur students to discover, organise,
and track placement and internship application forms from the IIT KGP ERP.

## Features

- Fetch placement and internship opportunities from ERP
- Extract application form links
- Extract application deadlines
- Separate placement and internship opportunities
- Sort opportunities by approaching deadline
- Track application status
- Provide a central dashboard
- Reduce the chance of missing application forms

## Project Status

🚧 Early Development

The extension is currently under active development.

## Architecture

```
IIT KGP ERP
    ↓
Content Scanner
    ↓
Notice Reader
    ↓
Notice Parser
    ↓
Deadline / Form Detection
    ↓
Local Storage
    ↓
Placement / Internship Dashboard
```
Privacy

The extension is designed to work with the user's existing
authenticated IIT KGP ERP session.

No ERP credentials should be stored by the extension.

Development

This project is currently being developed as an open-source
browser extension.

License
TBD


---

# 19. One thing about `.env`

For this project, **we currently don't need `.env` at all**.

Keep it because you've already created it, but don't depend on it.

Chrome extensions are client-side software, so anything bundled into:

```
manifest.json
*.js