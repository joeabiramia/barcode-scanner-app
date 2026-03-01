# Barcode Scanner App

This is a simple multi-user barcode scanner application with offline scanning, user management, and Excel export functionality.  It consists of a Node.js/Express backend and a client-side UI in the `public/` folder.

## Features

- Admin panel to create and manage users
- Authentication with JWT stored in `localStorage`
- Barcode scanning via ZXing (camera or file upload)
- Save entries per user and export to Excel
- Option to email your Excel file through backend
- Client-only vibration/beep when a barcode is detected

## Persistence

Users and entries are stored in JSON files under `DATA_DIR` (defaults to `/data`).
When running locally (without Docker) the default directory is changed to a `data/`
subfolder of the project root so that credentials persist across restarts on
Windows and other platforms.

Docker compose already mounts a named volume at `/data` so records survive
container restarts.  **Do not run `docker-compose down -v` unless you intend to
wipe all stored users and entries** – the volume holds your data.

## Configuration

| Environment variable | Purpose |
|----------------------|---------|
| `JWT_SECRET`         | Secret used to sign JWTs (change in production) |
| `DATA_DIR`           | Directory where `users.json` and `entries.json` are stored; by
|                      | default the app will use `~/.barcode-scanner-data` to avoid issues
|                      | with syncing services like OneDrive. |
| `EMAIL_HOST`         | SMTP host for outgoing email (required for Excel emailing) |
| `EMAIL_PORT`         | SMTP port |
| `EMAIL_USER`         | SMTP username |
| `EMAIL_PASS`         | SMTP password |
| `EMAIL_SECURE`       | Set to `true` for TLS/SSL connections |
| `EMAIL_FROM`         | Optional "from" address; defaults to `EMAIL_USER` |

The client-side code now exposes a constant `EXPORT_EMAIL` at the top of
`public/app.js`.  Set that value to the single address everyone’s exports
should go to (e.g. your own team mailbox).  Users will not be prompted; every
click of the download button sends the file to that address.  The backend also
ignores any supplied recipient, using its own configured value (`EXPORT_TO` or
`process.env.EXPORT_TO`).


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

1. **Credentials persist** – data directory now defaults to a folder in
   the user's home directory (e.g. `~/.barcode-scanner-data`) rather than a
   volatile project path.  This keeps accounts intact across restarts and
   avoids issues with synced directories like OneDrive.  You can still override
   with `DATA_DIR` if needed.
2. **Rear camera selection** – UI attempts to pick a back-facing camera by
   examining device labels ("back", "rear", or "environment").
3. **Phone vibration** – scanning routines call `navigator.vibrate(160)` when a
   barcode is successfully read.
4. **Email export** – pressing the download button now prompts for an email
   address and sends the Excel workbook to that address via a new `/api/send-`
   endpoint.  The file is still downloaded locally as well.

5. **Fixed add-row button** – the "+ add row & prepare next" control reliably
   fires its handler even after scans or panel visibility toggles; debugging
   output was added to help trace any remaining problems.

## Notes

- Sending email requires valid SMTP configuration in the environment.  If
  exports appear not to send you will see an error message in the UI, and the
  server log will include additional details (look for `send-excel called by`
  and any `Email send error:` lines).

- Be sure to set `EXPORT_EMAIL` in `public/app.js` (or the `EXPORT_TO`
  environment variable) to a real mailbox; the default is a dummy address and
  mail providers will drop or reject it silently.

- The admin user cannot be deleted or renamed, and its credentials persist too.

---

Enjoy!