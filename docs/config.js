/**
 * Runtime configuration.
 *
 * BACKEND_URL must point at the deployed Cloudflare Worker in ../worker,
 * which holds the Pi Server API Key and performs the /approve and /complete
 * calls. Payments cannot settle without it — GitHub Pages is static-only and
 * the Server API Key must never be shipped to the browser.
 */
window.APP_CONFIG = {
  // e.g. "https://metronome-pi.<your-subdomain>.workers.dev"
  BACKEND_URL: "",

  // Fixed tip, in Pi.
  TIP_AMOUNT: 0.1,

  /**
   * Sandbox is used for local development and for the Pi Sandbox host;
   * anywhere else (i.e. the Pi Browser hitting the live GitHub Pages URL)
   * runs against Mainnet.
   */
  get SANDBOX() {
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h.endsWith("sandbox.minepi.com");
  },
};
