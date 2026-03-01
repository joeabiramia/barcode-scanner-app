# Barcode Scanner App

This is a simple multi-user barcode scanner application with offline scanning, user management, and Excel export functionality.  It consists of a Node.js/Express backend and a client-side UI in the `public/` folder.

## Features

- Admin panel to create and manage users
- Authentication with JWT stored in `localStorage`
- Barcode scanning via ZXing (camera or file upload)
- Save entries per user and export to Excel
- Option to email your Excel file through backend
- Push rows to a shared OneDrive workbook (Microsoft Graph)
- Client-only vibration/beep when a barcode is detected

## Persistence

Users and entries are stored in JSON files under `DATA_DIR` (defaults to `/data`).
When running locally (without Docker) the default directory is changed to a `data/`
subfolder of the project root so that credentials persist across restarts on
Windows and other platforms.

Docker compose already mounts a named volume at `/data` so records survive
container restarts.

## Configuration

| Environment variable | Purpose |
|----------------------|---------|
| `JWT_SECRET`         | Secret used to sign JWTs (change in production) |
| `DATA_DIR`           | Directory where `users.json` and `entries.json` are stored |
| `EMAIL_HOST`         | SMTP host for outgoing email (required for Excel emailing) |
| `EMAIL_PORT`         | SMTP port |
| `EMAIL_USER`         | SMTP username |
| `EMAIL_PASS`         | SMTP password |
| `EMAIL_SECURE`       | Set to `true` for TLS/SSL connections |
| `EMAIL_FROM`         | Optional "from" address; defaults to `EMAIL_USER` |


## Running locally

```bash
# install dependencies
cd backend
npm install
# start server
node server.js
```

Open `public/login.html` in your browser (server runs on port 3000 by default).

## Docker

```bash
docker-compose up --build
```

## New behaviours implemented per user request

1. **Credentials persist** – data directory defaults to `../data` when not set;
   users.json is no longer overwritten on every start, ensuring accounts survive
   restarts of the server.
2. **Rear camera selection** – UI attempts to pick a back-facing camera by
   examining device labels ("back", "rear", or "environment").
3. **Phone vibration** – scanning routines call `navigator.vibrate(160)` when a
   barcode is successfully read.
4. **Email export** – pressing the download button now prompts for an email
   address and sends the Excel workbook to that address via a new `/api/send-`
   endpoint.  The file is still downloaded locally as well.

## Notes

- Sending email requires valid SMTP configuration in the environment.
- The admin user cannot be deleted or renamed, and its credentials persist too.

---

Enjoy!