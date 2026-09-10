# Tap Tempo

A tap-tempo metronome with a fixed 0.1 π tip, built as a reference for the
Pi App Platform integration workflow.

- **Frontend** — static, Material Design 3, in `docs/`.
- **Backend** — a Cloudflare Worker in `worker/` that performs the Pi
  Server-Side Approval and Completion calls.

This repo is the source of truth. The app is **published from a separate deploy
mirror**, [yao-pi/yao-pi.github.io](https://github.com/yao-pi/yao-pi.github.io),
so that it is served at a domain root:

| | |
|---|---|
| Production URL | `https://yao-pi.github.io/` |
| Deploy | `./scripts/deploy.sh` |

Pi verifies domain ownership by fetching `validation-key.txt` from the **domain
root**. An app on a project-Pages subpath (`/metronome-pi/`) would leave that
file where Pi never looks, so the root mirror is not optional.

## Why there are two pieces

Pi U2A payments are a three-phase flow. Phases I and III require your **Server
API Key**, which must never be shipped to a browser. GitHub Pages serves static
files only, so it cannot do this — the payment would be created and then hang,
never approved. The Worker exists solely to hold that key and make the two
server calls.

```
Pi Browser ──createPayment──▶ Pi SDK
    │                           │
    │  onReadyForServerApproval │
    ├──── POST /approve ───────▶ Worker ──── POST /payments/{id}/approve ───▶ Pi
    │                           │
    │  (user signs in wallet)   │
    │                           │
    │ onReadyForServerCompletion│
    └──── POST /complete ──────▶ Worker ──── POST /payments/{id}/complete ──▶ Pi
```

## Layout

```
docs/                  the app; mirrored to the deploy repo verbatim
  index.html
  styles.css           MD3 tokens: colour, type scale, shape, elevation, motion
  app.js               tap tempo + Pi SDK integration
  config.js            BACKEND_URL, tip amount, sandbox flag
scripts/deploy.sh      copies docs/ into the deploy mirror and pushes
worker/
  src/index.js         /approve and /complete
  test/index.test.mjs  14 tests against a stubbed Pi API
  wrangler.toml
```

There is no `validation-key.txt` here on purpose. It lives only in the deploy
mirror, so a sync can never overwrite the real key with a placeholder.

## Setup

### 1. Register the app

In the Pi Browser, open `develop.pi`:

- Create the app, then note the **Server API Key**.
- Set the **Production URL** to `https://yao-pi.github.io/` — the domain root,
  served by the deploy mirror.
- Set the **Development URL** to `http://localhost:8000` — this is where *your*
  machine serves the app (see [Local development](#local-development)); the Pi
  Sandbox loads it from there. It is not a URL Pi gives you.
- Put the **validation key** in the deploy mirror's `validation-key.txt` and
  push, so Pi can verify you control the domain:

  ```bash
  cd ~/Claude/yao-pi.github.io
  echo "PASTE_KEY_HERE" > validation-key.txt
  git add validation-key.txt && git commit -m "Update Pi domain validation key" && git push
  ```

  Confirm `https://yao-pi.github.io/validation-key.txt` returns exactly the key,
  then click **Verify domain**.

The **Sandbox URL** is the separate one Pi hands *back* to you, under "Run
Development App in the Sandbox" in the app checklist. It looks like
`https://sandbox.minepi.com/mobile-app-ui/app/<your-app-name>`, and it is the
URL you actually open to test. Your dev server must be running on port 8000 at
the time, or the Sandbox has nothing to load.

### 2. Deploy the Worker

```bash
cd worker
npm install
npx wrangler secret put PI_API_KEY     # paste the Server API Key
npx wrangler deploy
```

Confirm the allowed origins in `wrangler.toml` match where the app is served
from. Check it came up:

```bash
curl https://metronome-pi.<your-subdomain>.workers.dev/health
```

`{"ok":true,"configured":true}` means the key is bound.

### 3. Point the frontend at it

Set `BACKEND_URL` in `docs/config.js` to the Worker URL, commit here, then
publish it to the live site:

```bash
./scripts/deploy.sh "Point frontend at the Worker"
```

`ALLOWED_ORIGINS` in `worker/wrangler.toml` already covers
`https://yao-pi.github.io` — an origin has no path, so the root and any subpath
share one entry.

### 4. Test

Open the app in the **Pi Browser** — `window.Pi` only exists there, so the tip
button is inert in a desktop browser (the metronome itself works anywhere).

## Environments

**`SANDBOX` is currently forced to `true`** in `config.js`, so every environment —
including the deployed Pages URL — runs against the Pi Sandbox and no real Pi
can move. A "Sandbox" badge shows in the app bar whenever the flag is on.

To go live, set `SANDBOX: false`. `config.js` also carries a commented-out
getter that picks the environment from the hostname instead, if you'd rather
have localhost stay on Sandbox while production runs Mainnet.

Note that the supported way to exercise the Sandbox is the Sandbox URL pointed
at your local dev server; `sandbox: true` on the public Pages URL keeps real Pi
safe but is not a configuration Pi documents.

## Local development

Serve `docs/` on port 8000 — this is the **Development URL** you register in the
Developer Portal, and the port `ALLOWED_ORIGINS` already whitelists. If you
change it, change it in `worker/wrangler.toml` and the Portal too.

```bash
python3 -m http.server 8000 --directory docs
cd worker && npx wrangler dev
```

Note the app sits at the server root locally (`http://localhost:8000/`), whereas
in production it is under a subpath (`/metronome-pi/`). All asset paths are
relative, so both work.

```bash
cd worker && npm test
```

## Security notes

The Worker does not trust the client. On every call it:

- verifies the access token against `GET /me` and uses **that** uid, not one
  sent by the browser;
- re-reads the payment from Pi and rejects it if the amount is not 0.1 π, the
  uid does not match, or the payment was cancelled;
- treats a non-200 from `/complete` as failure and does **not** credit the tip,
  since a tampered client can claim a payment it never made;
- rejects requests from origins outside `ALLOWED_ORIGINS`.

## Reference

- [Pi Platform docs](https://docs.minepi.com/)
- [SDK reference](https://github.com/pi-apps/pi-platform-docs/blob/master/SDK_reference.md)
- [Platform API](https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md)
