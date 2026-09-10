/**
 * Tap Tempo — Pi payment backend.
 *
 * The Pi Platform requires Server-Side Approval and Server-Side Completion for
 * every U2A payment, authorised with a Server API Key. That key must never
 * reach the browser, so these two calls live here rather than in the static
 * app on GitHub Pages.
 *
 * Endpoints:
 *   POST /approve   { paymentId, accessToken }
 *   POST /complete  { paymentId, txid, accessToken }
 *   GET  /health
 *
 * Bindings:
 *   PI_API_KEY       (secret)  Server API Key from the Pi Developer Portal
 *   ALLOWED_ORIGINS  (var)     comma-separated list of allowed browser origins
 *   TIP_AMOUNT       (var)     expected tip, as a string, e.g. "0.1"
 */

const PI_API_BASE = "https://api.minepi.com/v2";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = allowedOrigins(env);
  const headers = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body, status, request, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request, env) },
  });
}

/** Call the Pi Platform API with the Server API Key. */
async function piServerFetch(env, path, init = {}) {
  const response = await fetch(`${PI_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Key ${env.PI_API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

/**
 * Resolve the caller's access token to a uid.
 *
 * The frontend's own claim about who the user is cannot be trusted — a tampered
 * client can send anything — so the token is verified against /me and the uid
 * from that response is the one we compare the payment against.
 */
async function resolveUid(accessToken) {
  if (!accessToken) return null;
  const response = await fetch(`${PI_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.uid || null;
}

/**
 * Fetch the payment and check it is really the 0.1 π tip, really belongs to
 * the caller, and has not been cancelled.
 */
async function loadVerifiedPayment(env, paymentId, uid) {
  const { ok, status, body } = await piServerFetch(env, `/payments/${paymentId}`);
  if (!ok) return { error: `Could not read payment (HTTP ${status})`, status: 502 };

  const expected = Number(env.TIP_AMOUNT || "0.1");
  if (Number(body.amount) !== expected) {
    return { error: "Unexpected payment amount.", status: 400 };
  }
  if (body.user_uid !== uid) {
    return { error: "Payment does not belong to this user.", status: 403 };
  }
  if (body.status?.cancelled || body.status?.user_cancelled) {
    return { error: "Payment was cancelled.", status: 409 };
  }
  return { payment: body };
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                    */
/* -------------------------------------------------------------------------- */

async function handleApprove(request, env, payload) {
  const { paymentId, accessToken } = payload;
  if (!paymentId) return json({ error: "paymentId is required." }, 400, request, env);

  const uid = await resolveUid(accessToken);
  if (!uid) return json({ error: "Invalid access token." }, 401, request, env);

  const verified = await loadVerifiedPayment(env, paymentId, uid);
  if (verified.error) return json({ error: verified.error }, verified.status, request, env);

  // Approving twice is not an error worth surfacing — the desired end state is
  // already reached, and the SDK may legitimately retry the callback.
  if (verified.payment.status?.developer_approved) {
    return json({ ok: true, alreadyApproved: true }, 200, request, env);
  }

  const { ok, status, body } = await piServerFetch(env, `/payments/${paymentId}/approve`, {
    method: "POST",
  });
  if (!ok) {
    console.error("approve failed", status, body);
    return json({ error: `Approval rejected by Pi (HTTP ${status})` }, 502, request, env);
  }

  return json({ ok: true, payment: body }, 200, request, env);
}

async function handleComplete(request, env, payload) {
  const { paymentId, txid, accessToken } = payload;
  if (!paymentId || !txid) {
    return json({ error: "paymentId and txid are required." }, 400, request, env);
  }

  const uid = await resolveUid(accessToken);
  if (!uid) return json({ error: "Invalid access token." }, 401, request, env);

  const verified = await loadVerifiedPayment(env, paymentId, uid);
  if (verified.error) return json({ error: verified.error }, verified.status, request, env);

  if (verified.payment.status?.developer_completed) {
    return json({ ok: true, alreadyCompleted: true }, 200, request, env);
  }

  const { ok, status, body } = await piServerFetch(env, `/payments/${paymentId}/complete`, {
    method: "POST",
    body: JSON.stringify({ txid }),
  });

  // A non-200 here means Pi could not confirm the transaction. The user may be
  // running a tampered SDK and claiming a payment they never made, so the tip
  // must not be treated as received.
  if (!ok) {
    console.error("complete failed", status, body);
    return json({ error: `Completion rejected by Pi (HTTP ${status})` }, 502, request, env);
  }

  return json({ ok: true, payment: body }, 200, request, env);
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (pathname === "/health") {
      return json({ ok: true, configured: Boolean(env.PI_API_KEY) }, 200, request, env);
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405, request, env);
    }

    const origin = request.headers.get("Origin") || "";
    if (origin && !allowedOrigins(env).includes(origin)) {
      return json({ error: "Origin not allowed." }, 403, request, env);
    }

    if (!env.PI_API_KEY) {
      return json({ error: "Server is missing PI_API_KEY." }, 500, request, env);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400, request, env);
    }

    if (pathname === "/approve") return handleApprove(request, env, payload);
    if (pathname === "/complete") return handleComplete(request, env, payload);

    return json({ error: "Not found." }, 404, request, env);
  },
};
