/**
 * Runtime configuration.
 *
 * BACKEND_URL must point at the deployed Cloudflare Worker in ../worker,
 * which holds the Pi Server API Key and performs the /approve and /complete
 * calls. Payments cannot settle without it — GitHub Pages is static-only and
 * the Server API Key must never be shipped to the browser.
 */
window.APP_CONFIG = {
  // The Cloudflare Worker in ../worker. No trailing slash — paths are appended
  // directly, so one would produce "//approve".
  BACKEND_URL: "https://metronome-pi.yao-pi.workers.dev",

  // Fixed tip, in Pi.
  TIP_AMOUNT: 0.1,

  /**
   * The Pi network this app is registered on in the Developer Portal.
   *
   * Independent of SANDBOX: the sandbox flag selects the Pi Sandbox dev
   * environment, whereas the network is fixed by the Portal registration. A
   * Testnet app moves Testnet Pi whichever way it is opened.
   *
   * Displayed as a badge, and shown in red once it reads "Mainnet". Change it
   * only when the app is actually re-registered on Mainnet — nothing here
   * switches networks on its own.
   */
  NETWORK: "Testnet",

  /**
   * The sandbox flag must match how the app was reached, or the SDK has no one
   * to talk to:
   *
   *   Pi Sandbox  → frames http://localhost:8000 → needs sandbox: true
   *   Pi Browser  → https://yao-pi.github.io/    → needs sandbox: false
   *
   * Forcing it true broke payments in the Pi Browser: sandbox mode expects a
   * sandbox host frame to hand the payment to, and on the production URL there
   * isn't one, so the flow never starts.
   *
   * This flag says nothing about which blockchain the tip settles on — see
   * NETWORK below.
   */
  get SANDBOX() {
    const h = location.hostname;
    return h === "localhost"
      || h === "127.0.0.1"
      || h === "sandbox.minepi.com"
      || h.endsWith(".sandbox.minepi.com");
  },
};
