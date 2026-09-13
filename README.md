# Aqua Nova Studio — Infrastructure Monitor

Static Firebase monitoring dashboard for ANASTUDIO. Built for GitHub Pages or any static hosting.

## Folder structure

- `index.html` — application shell
- `assets/css/style.css` — complete dashboard styling
- `assets/js/firebase-config.js` — Firebase web configuration
- `assets/js/auth.js` — Firebase Email/Password authentication
- `assets/js/dashboard.js` — realtime monitoring dashboard
- `assets/js/reports.js` — Daily / Weekly / Monthly professional Excel export
- `assets/js/utils.js` — formatter and helper functions
- `assets/img/aquanova-logo.png` — Aqua Nova logo
- `database.rules.json` — recommended Realtime Database rules

## 1. Enable Firebase Authentication

Firebase Console → Authentication → Sign-in method → enable **Email/Password**.

Then Authentication → Users → Add user:

- Email: `admin@ana.studio`
- Password: choose your own strong password

The password is NOT stored in this repository.

## 2. Apply Realtime Database rules

Firebase Console → Realtime Database → Rules. Copy the content of `database.rules.json` and Publish.

The Node.js server agent uses Firebase Admin SDK, so it can still write telemetry. The browser dashboard can only read after an authenticated `admin@ana.studio` login.

## 3. Required Firebase paths

Realtime dashboard:

`servers/anastudio/current`

Excel reports:

`servers/anastudio/history`

Each history record must contain a numeric `timestamp`. Daily/Weekly/Monthly report queries use this field.

## 4. GitHub Pages

Push this entire folder to a GitHub repository. Then Repository → Settings → Pages → Deploy from branch → `main` / root.

After GitHub Pages gives you the public hostname, add that hostname in:

Firebase Console → Authentication → Settings → Authorized domains.

Example: `username.github.io` (hostname only, without `https://`).

## 5. Local preview

Because this uses ES modules, do not open `index.html` with `file://`. Use a local HTTP server, e.g.:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` and add `localhost` to Firebase Authorized domains if necessary.

## Security notes

- Firebase Web `apiKey` is expected to be visible in frontend code. Access control is enforced by Firebase Authentication + Realtime Database Rules.
- NEVER copy your Firebase Admin service-account JSON into this repository.
- Keep `/opt/anastudio-monitor/credentials/firebase-service-account.json` only on ANASTUDIO.
- Do not commit server `.env` or Admin SDK credentials.

## Excel reports

The report generator creates `.xlsx` workbooks directly in the browser using ExcelJS. It includes:

- Executive Summary
- KPI averages and peaks
- Capacity snapshot
- Detailed telemetry sheet
- Raw current Firebase snapshot

If the UI says there is no historical data, update the server collector so it writes periodic samples to `servers/anastudio/history`.
