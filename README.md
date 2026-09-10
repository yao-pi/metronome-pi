# Tap Tempo

A tap-tempo metronome with a fixed 0.1 π tip, built as a reference for the
Pi App Platform integration workflow.

- **Frontend** — static, Material Design 3, deployed to GitHub Pages from `docs/`.
- **Backend** — a Cloudflare Worker in `worker/` that performs the Pi
  Server-Side Approval and Completion calls.

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
docs/                  GitHub Pages root
  index.html
  styles.css           MD3 tokens: colour, type scale, shape, elevation, motion
  app.js               tap tempo + Pi SDK integration
  config.js            BACKEND_URL, tip amount, sandbox detection
  validation-key.txt   ← replace with your key from the Developer Portal
worker/
  src/index.js         /approve and /complete
  test/index.test.mjs  14 tests against a stubbed Pi API
  wrangler.toml
```

## Setup

### 1. Register the app

In the Pi Browser, open `develop.pi`:

- Create the app, then note the **Server API Key**.
- Set the **Production URL** to `https://yao-pi.github.io/metronome-pi/`.
- Set the **Development URL** to `http://localhost:8000` — this is where *your*
  machine serves the app (see [Local development](#local-development)); the Pi
  Sandbox loads it from there. It is not a URL Pi gives you.
- Copy the **validation key** into `docs/validation-key.txt` and push, so Pi can
  verify you control the domain.

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

Set `BACKEND_URL` in `docs/config.js` to the Worker URL, then commit and push.
GitHub Pages redeploys automatically.

### 4. Test

Open the app in the **Pi Browser** — `window.Pi` only exists there, so the tip
button is inert in a desktop browser (the metronome itself works anywhere).

## Environments

`config.js` picks sandbox automatically on `localhost` and `sandbox.minepi.com`,
and Mainnet everywhere else, so the deployed Pages URL runs against Mainnet.
A "Sandbox" badge appears in the app bar when the sandbox flag is on.

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
