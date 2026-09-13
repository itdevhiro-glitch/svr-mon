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

## Backup & Recovery Center

Versi ini menambahkan menu **Backup & Recovery** untuk ANASTUDIO.

Fitur:

- Progress backup realtime (persentase, source, current file, transferred bytes, speed)
- Backup `/srv/aquanova/` dan `/mnt/gdrive/`
- Snapshot mingguan setiap Minggu 01:50
- Retention default 8 snapshot
- Incremental snapshot dengan hardlink `--link-dest`
- Recent file activity
- Snapshot history
- Download latest backup log dari dashboard
- Search file pada manifest backup
- One-click recovery ke path asli
- Recovery audit log
- Manual **Run Backup Now** dari dashboard

### Arsitektur keamanan

Browser tidak memiliki akses shell/filesystem server. Dashboard hanya membuat request terbatas di Firebase:

`servers/anastudio/backup/requests`

`backup-agent.js` pada ANASTUDIO membaca request tersebut dengan Firebase Admin SDK. Hanya command `search`, `restore`, dan `runBackup` yang diterima. Path restore divalidasi agar tidak dapat keluar dari `/srv/aquanova` atau `/mnt/gdrive`.

### Instalasi server

Upload/copy folder `server/` ke ANASTUDIO, lalu:

```bash
cd server
sudo ./install-backup-center.sh
```

Installer mengharapkan service account Firebase yang sudah dipakai monitoring berada di:

```text
/opt/anastudio-monitor/credentials/firebase-service-account.json
```

Setelah instalasi:

```bash
systemctl status aquanova-backup-controller.service --no-pager
systemctl list-timers aquanova-backup.timer --no-pager
```

Start backup manual dari terminal (background):

```bash
sudo systemctl start --no-block aquanova-backup.service
```

Cek status:

```bash
systemctl is-active aquanova-backup.service
```

### Firebase rules

Publish `database.rules.json` versi terbaru ke Firebase Realtime Database Rules. Rules tersebut tetap read-only untuk telemetry, tetapi mengizinkan `admin@ana.studio` menulis request ke Backup Center.

### Catatan Google Drive

Recovery ke source `gdrive` hanya dijalankan jika `/mnt/gdrive` sedang mounted. Restore ke `/mnt/gdrive/...` akan menulis file kembali ke mount Google Drive.

## Backup & Recovery Dashboard
Frontend ini hanya panel web dan aman untuk repository GitHub Pages. Eksekusi backup/recovery tidak dilakukan oleh GitHub; request dikirim melalui Firebase ke backend `anastudio` yang dipasang terpisah.

Backend server tersedia sebagai paket terpisah `anastudio-backup-backend.zip`.

Fitur panel:
- status/progress backup,
- current file dan recent files,
- snapshot history,
- download log terbaru,
- pencarian file di 8 snapshot terakhir,
- restore file ke lokasi asal,
- run backup manual.

`database.rules.json` di repository ini perlu dipublish ke Firebase Realtime Database Rules agar akun admin dapat membuat request backup/recovery.
