# JSON Grab

A Foundry VTT v14 module that adds a **"Share as QR / JSON Link"** control to every Actor and
Item sheet. Clicking it shows a QR code with a copyable HTTPS link underneath. Anyone who scans
the QR or pastes the link, in a browser, `curl`, or a `fetch()` call, grabs the document's JSON
in Foundry's native export format, re-importable via right-click and *Import Data*.

**Status: in development (milestone 0/1).** See [PLAN.md](PLAN.md) for the roadmap and design
decisions. Not yet published to the Foundry package listing.

## How it works

- The export is written into your own server's Data folder
  (`worlds/<world-id>/json-grab/`) and served as a static file. No third parties.
- The file name contains a random 16 character salt, so the URL is unguessable.
- **Links are ephemeral.** Each share revokes itself automatically after the configured
  lifetime (default 5 minutes, module setting); the dialog shows a live countdown.
  Sharing again within the window reuses the same URL and resets the clock; after expiry
  the next share creates a fresh URL. Expired links show a "Link revoked" page.
- The expiry timer runs in the GM's client. Shares that outlive the session are cleaned
  up automatically on the next world load. Macros can revoke early via
  `game.modules.get("json-grab").api.revoke(doc)`.
- The QR encodes the full URL, built from the address your browser uses
  (override available in module settings for reverse proxy setups).

## Requirements

- Foundry VTT v14.
- Your Foundry server must be reachable by whoever uses the link (a domain with
  HTTPS through a reverse proxy works great; pure localhost does not).
- Sharing defaults to the GM. A world setting extends it to document owners or to
  observers; non-GM users also need the core file upload permission, because shares
  are written with the sharing user's own rights.

## Installation (development)

Copy this folder to your server as `<userData>/Data/modules/json-grab/` and enable
**JSON Grab** in your world's module management. A manifest install link will be
provided with the first GitHub release.

## Testing checklist (milestone 0 spikes)

Run in the GM client's console (F12):

```js
// Spike A: anonymous fetch of an uploaded file
await game.modules.get("json-grab").api.spikeA()

// Spike B: open an Actor or Item sheet, find "Share as QR / JSON Link"
// in the header controls menu, click it, scan the QR with a phone.

// Spike C: compare payload with a native export
const doc = game.actors.getName("Some Actor");
game.modules.get("json-grab").api.diffAgainstNative(doc, `<paste native Export Data text>`)
```

## Instant download on scan (optional, recommended)

The module ships a small landing page (`download.html`) that fetches the JSON, names the
file after the document (for example `awakened-shrub.json`), and starts the download
immediately. This is much friendlier for QR scans than a raw JSON dump.

Foundry serves `.html` files from the Data folder as `text/plain` on purpose (an anti XSS
measure), so the page needs one reverse proxy rule to be delivered as real HTML. **The module
detects this automatically:** with the rule, QR codes and links point at the download page;
without it, they fall back to the raw JSON file. The Foundry console logs which mode is
active on world load.

nginx example, added inside the same `server` block that proxies Foundry:

```nginx
location = /modules/json-grab/download.html {
    proxy_pass http://localhost:30000;   # same target as your main location block
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_hide_header Content-Type;
    add_header Content-Type "text/html; charset=utf-8";
}
```

Then `nginx -t && systemctl reload nginx` and refresh Foundry. The landing page itself
links to the raw JSON URL for `curl`, `fetch`, and other tools.

## Privacy notes

- Files in Foundry's Data folder are served without a Foundry login. That is what
  makes this module possible; it also means anyone holding a link can fetch that
  file. Links are unguessable and revocable, and nothing is exported without an
  explicit click.
- Foundry has no client-side file delete API, so revoked files remain on disk as
  tiny `{"revoked": true}` tombstones. Delete `worlds/<world-id>/json-grab/` from
  the server file system any time you want a clean slate.

## Credits

- QR encoding by [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
  1.4.4 by Kazuhiko Arase, MIT license, vendored at `scripts/lib/qrcode.js`.
  "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

## License

[MIT](LICENSE)
