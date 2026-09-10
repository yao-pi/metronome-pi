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
   * Forced on: every environment, including the deployed GitHub Pages URL,
   * runs against the Pi Sandbox. No real Pi can move while this is true.
   *
   * Set to false to go live on Mainnet.
   *
   * To go back to picking the environment from the host instead:
   *
   *   get SANDBOX() {
   *     const h = location.hostname;
   *     return h === "localhost" || h === "127.0.0.1"
   *       || h === "sandbox.minepi.com" || h.endsWith(".sandbox.minepi.com");
   *   },
   */
  SANDBOX: true,
};
