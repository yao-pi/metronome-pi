"use strict";

/* ==========================================================================
   Tap Tempo — a tap-to-capture metronome with a fixed Pi tip.
   ========================================================================== */

const CONFIG = window.APP_CONFIG;

const el = {
  bpmValue: document.getElementById("bpm-value"),
  marking: document.getElementById("tempo-marking"),
  beatTrack: document.getElementById("beat-track"),
  beatDots: Array.from(document.querySelectorAll(".beat-dot")),
  tapButton: document.getElementById("tap-button"),
  resetButton: document.getElementById("reset-button"),
  tipButton: document.getElementById("tip-button"),
  tipStatus: document.getElementById("tip-status"),
  snackbar: document.getElementById("snackbar"),
  snackbarText: document.getElementById("snackbar-text"),
  envBadge: document.getElementById("env-badge"),
};

/* --------------------------------------------------------------------------
   Snackbar
   -------------------------------------------------------------------------- */

let snackbarTimer = null;

function snackbar(message, duration = 4000) {
  el.snackbarText.textContent = message;
  el.snackbar.classList.add("is-open");
  clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => el.snackbar.classList.remove("is-open"), duration);
}

/* ==========================================================================
   Tap tempo
   ========================================================================== */

/**
 * Taps further apart than this start a new measurement rather than dragging
 * the average down — it means the user stopped and is timing something else.
 */
const RESET_AFTER_MS = 2000;

/** Rolling window. Long enough to be stable, short enough to follow a drift. */
const WINDOW_SIZE = 8;

const MIN_BPM = 20;
const MAX_BPM = 400;

/** @type {number[]} timestamps, most recent last */
let taps = [];
let beatIndex = 0;
let currentBpm = null;

/** Italian tempo markings, by BPM ceiling. */
const TEMPO_MARKINGS = [
  [24, "Larghissimo"],
  [40, "Grave"],
  [60, "Largo"],
  [66, "Larghetto"],
  [76, "Adagio"],
  [108, "Andante"],
  [120, "Moderato"],
  [156, "Allegro"],
  [176, "Vivace"],
  [200, "Presto"],
  [Infinity, "Prestissimo"],
];

function markingFor(bpm) {
  return TEMPO_MARKINGS.find(([ceiling]) => bpm < ceiling)[1];
}

function registerTap() {
  const now = performance.now();

  if (taps.length && now - taps[taps.length - 1] > RESET_AFTER_MS) {
    taps = [];
  }

  taps.push(now);
  if (taps.length > WINDOW_SIZE) taps.shift();

  pulse();

  // A single tap establishes only a starting point, not yet an interval.
  if (taps.length < 2) {
    currentBpm = null;
    el.bpmValue.textContent = "--";
    el.marking.textContent = "Keep tapping…";
    return;
  }

  // Mean interval across the window. Using first-to-last over the number of
  // gaps is equivalent to averaging every gap, and needs no intermediate array.
  const spanMs = taps[taps.length - 1] - taps[0];
  const bpm = (60000 * (taps.length - 1)) / spanMs;

  if (bpm < MIN_BPM || bpm > MAX_BPM) {
    // Out-of-range reading: treat this tap as the start of a fresh count.
    taps = [now];
    currentBpm = null;
    el.bpmValue.textContent = "--";
    el.marking.textContent = "Keep tapping…";
    return;
  }

  currentBpm = Math.round(bpm);
  el.bpmValue.textContent = String(currentBpm);
  el.marking.textContent = `${markingFor(currentBpm)} · ${taps.length} taps`;
}

function pulse() {
  el.beatDots.forEach((dot, i) => dot.classList.toggle("is-active", i === beatIndex));
  beatIndex = (beatIndex + 1) % el.beatDots.length;

  el.tapButton.classList.remove("is-pulsing");
  void el.tapButton.offsetWidth; // restart the CSS animation
  el.tapButton.classList.add("is-pulsing");
}

function resetTempo() {
  taps = [];
  beatIndex = 0;
  currentBpm = null;
  el.bpmValue.textContent = "--";
  el.marking.textContent = "Tap the button to begin";
  el.beatDots.forEach((dot) => dot.classList.remove("is-active"));
}

/* --- Ripple ---------------------------------------------------------------- */

function ripple(event, target) {
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const x = (event.clientX ?? rect.left + rect.width / 2) - rect.left;
  const y = (event.clientY ?? rect.top + rect.height / 2) - rect.top;

  const span = document.createElement("span");
  span.className = "ripple";
  span.style.width = span.style.height = `${size}px`;
  span.style.left = `${x - size / 2}px`;
  span.style.top = `${y - size / 2}px`;
  target.appendChild(span);
  span.addEventListener("animationend", () => span.remove());
}

/* --- Input ----------------------------------------------------------------- */

/**
 * Tap timing is taken from pointerdown, not click: click fires on release,
 * which adds the user's own press duration as jitter to every interval.
 */
el.tapButton.addEventListener("pointerdown", (event) => {
  ripple(event, el.tapButton);
  registerTap();
});

// pointerdown does not fire for keyboard activation, so handle keys separately
// and suppress the synthetic click they would otherwise produce.
el.tapButton.addEventListener("keydown", (event) => {
  if (event.key !== " " && event.key !== "Enter") return;
  event.preventDefault();
  if (event.repeat) return;
  ripple(event, el.tapButton);
  registerTap();
});

el.tapButton.addEventListener("click", (event) => event.preventDefault());

el.resetButton.addEventListener("click", (event) => {
  ripple(event, el.resetButton);
  resetTempo();
});

// Space anywhere on the page is a natural tap key; don't steal it from buttons.
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.repeat) return;
  if (event.target.closest("button")) return;
  event.preventDefault();
  registerTap();
});

/* ==========================================================================
   Pi Platform integration
   ========================================================================== */

const PI_AVAILABLE = typeof window.Pi !== "undefined";

let piReady = false;
let auth = null; // { accessToken, user: { uid, username } }

if (PI_AVAILABLE) {
  try {
    window.Pi.init({ version: "2.0", sandbox: CONFIG.SANDBOX });
    piReady = true;
  } catch (error) {
    console.error("Pi.init failed", error);
  }
}

// Show which network is live. Mainnet is called out because a tip there moves
// real Pi, and the two modes are otherwise indistinguishable on screen.
if (piReady) {
  el.envBadge.textContent = CONFIG.SANDBOX ? "Sandbox" : "Mainnet · real Pi";
  el.envBadge.classList.toggle("badge--live", !CONFIG.SANDBOX);
  el.envBadge.hidden = false;
}

function setTipStatus(message, kind = "") {
  el.tipStatus.textContent = message;
  el.tipStatus.className = `tip__status${kind ? ` is-${kind}` : ""}`;
}

function setTipBusy(busy) {
  el.tipButton.disabled = busy;
  el.tipButton.classList.toggle("is-busy", busy);
}

/** POST to the app server, which is the only party holding the API key. */
async function callBackend(path, body) {
  const response = await fetch(`${CONFIG.BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `${path} failed (HTTP ${response.status})`);
  }
  return payload;
}

/**
 * Called by the SDK when a previous payment was submitted to the blockchain
 * but never completed by us. It must be cleared before a new payment is
 * allowed, so finish it server-side.
 */
async function onIncompletePaymentFound(payment) {
  console.warn("Incomplete payment found", payment);
  const txid = payment?.transaction?.txid;
  if (!payment?.identifier || !txid) return;

  try {
    await callBackend("/complete", {
      paymentId: payment.identifier,
      txid,
      accessToken: auth?.accessToken,
    });
    snackbar("Finished a previous pending tip.");
  } catch (error) {
    console.error("Failed to complete pending payment", error);
  }
}

async function ensureAuthenticated() {
  if (auth) return auth;
  auth = await window.Pi.authenticate(["username", "payments"], onIncompletePaymentFound);
  return auth;
}

function createTip() {
  return new Promise((resolve, reject) => {
    window.Pi.createPayment(
      {
        amount: CONFIG.TIP_AMOUNT,
        memo: "Tip for Tap Tempo",
        metadata: { type: "tip", app: "tap-tempo", bpm: currentBpm },
      },
      {
        onReadyForServerApproval: async (paymentId) => {
          setTipStatus("Approving…");
          try {
            await callBackend("/approve", { paymentId, accessToken: auth.accessToken });
          } catch (error) {
            reject(error);
          }
        },

        onReadyForServerCompletion: async (paymentId, txid) => {
          setTipStatus("Confirming on the blockchain…");
          try {
            await callBackend("/complete", { paymentId, txid, accessToken: auth.accessToken });
            resolve({ paymentId, txid });
          } catch (error) {
            reject(error);
          }
        },

        onCancel: () => reject(Object.assign(new Error("Tip cancelled."), { cancelled: true })),

        onError: (error) => reject(error),
      },
    );
  });
}

el.tipButton.addEventListener("click", async (event) => {
  ripple(event, el.tipButton);

  if (!piReady) {
    setTipStatus("Open this app in the Pi Browser to tip.", "error");
    snackbar("Tipping needs the Pi Browser.");
    return;
  }

  if (!CONFIG.BACKEND_URL) {
    setTipStatus("Tipping is not configured yet.", "error");
    snackbar("Set BACKEND_URL in config.js to enable tips.", 6000);
    return;
  }

  setTipBusy(true);
  setTipStatus("Opening Pi Wallet…");

  try {
    await ensureAuthenticated();
    await createTip();
    setTipStatus(`Thank you! ${CONFIG.TIP_AMOUNT} π received.`, "success");
    snackbar("Tip sent — thank you!");
  } catch (error) {
    if (error?.cancelled) {
      setTipStatus("");
      snackbar("Tip cancelled.");
    } else {
      console.error("Tip failed", error);
      setTipStatus(error?.message || "Tip failed. Please try again.", "error");
      snackbar("Tip failed.");
    }
  } finally {
    setTipBusy(false);
  }
});
