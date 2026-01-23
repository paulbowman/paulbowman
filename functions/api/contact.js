// /functions/api/contact.js
// Cloudflare Pages Function: contact form -> (optional) Turnstile -> Resend -> redirect to /thanks.html

function textResponse(msg, status = 200) {
  return new Response(msg, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function verifyTurnstile({ token, secret, ip }) {
  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: ip || "",
  });

  const res = await fetchWithTimeout(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
    8000
  );

  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

async function sendResend({ apiKey, to, from, subject, text, replyTo }) {
  const payload = {
    from, // e.g. "Paul Bowman <contact@paulbowman.us>"
    to: [to],
    subject,
    text,
    // Resend expects reply_to (string or array). We'll pass the email string.
    reply_to: replyTo || undefined,
  };

  const res = await fetchWithTimeout(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    8000
  );

  return res;
}

export async function onRequestGet() {
  // Useful smoke test (should never 502)
  return textResponse("OK (api/contact is live)");
}

export async function onRequestPost({ request, env }) {
  console.log("contact: start");

  try {
    const form = await request.formData();

    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const message = String(form.get("message") || "").trim();

    if (!name || !email || !message) {
      console.log("contact: missing fields");
      return textResponse("Missing required fields.", 400);
    }

    // Toggle these in env to isolate issues quickly:
    // BYPASS_TURNSTILE = "1"
    // BYPASS_EMAIL = "1"
    const bypassTurnstile = String(env.BYPASS_TURNSTILE || "") === "1";
    const bypassEmail = String(env.BYPASS_EMAIL || "") === "1";

    // Turnstile (optional)
    if (!bypassTurnstile && env.TURNSTILE_SECRET) {
      console.log("contact: turnstile verify");

      const token = String(form.get("cf-turnstile-response") || "");
      if (!token) return textResponse("Captcha missing. Please try again.", 403);

      const ip = request.headers.get("CF-Connecting-IP") || "";
      const { ok, json } = await verifyTurnstile({
        token,
        secret: env.TURNSTILE_SECRET,
        ip,
      });

      if (!ok || !json.success) {
        console.log("contact: turnstile failed", JSON.stringify(json));
        return textResponse("Captcha failed. Please try again.", 403);
      }

      console.log("contact: turnstile ok");
    } else {
      console.log("contact: turnstile bypassed");
    }

    if (bypassEmail) {
      console.log("contact: email bypassed -> redirect");
      return Response.redirect(new URL("/thanks.html", request.url).toString(), 303);
    }

    // Resend config
    if (!env.RESEND_API_KEY) {
      console.log("contact: missing RESEND_API_KEY");
      return textResponse("Server misconfigured (RESEND_API_KEY missing).", 500);
    }
    if (!env.TO_EMAIL) {
      console.log("contact: missing TO_EMAIL");
      return textResponse("Server misconfigured (TO_EMAIL missing).", 500);
    }

    // FROM_EMAIL can be either:
    // 1) "contact@paulbowman.us"
    // 2) "Paul Bowman <contact@paulbowman.us>"
    // If omitted, we fall back to a safe default (you should set it).
    const from = String(env.FROM_EMAIL || "").trim();
    if (!from) {
      console.log("contact: missing FROM_EMAIL");
      return textResponse("Server misconfigured (FROM_EMAIL missing).", 500);
    }

    console.log("contact: sending email (resend)");

    const siteName = env.SITE_NAME || "paulbowman.us";
    const subject = `New message from ${siteName}`;
    const text =
      `Name: ${name}\n` +
      `Email: ${email}\n` +
      `IP: ${request.headers.get("CF-Connecting-IP") || "unknown"}\n\n` +
      `${message}\n`;

    const sendRes = await sendResend({
      apiKey: env.RESEND_API_KEY,
      to: env.TO_EMAIL,
      from,
      subject,
      text,
      replyTo: email,
    });

    // Log status first so you can tell if it returned at all
    console.log("contact: resend status", sendRes.status);

    if (!sendRes.ok) {
      const errText = await sendRes.text().catch(() => "");
      console.log("contact: resend failed", sendRes.status, errText);
      return textResponse(`Email send failed (${sendRes.status}).\n\n${errText}`, 502);
    }

    console.log("contact: success -> redirect");
    return Response.redirect(new URL("/thanks.html", request.url).toString(), 303);
  } catch (err) {
    console.log("contact: unhandled error", String(err?.message || err));
    return textResponse(`Unhandled error: ${err?.message || String(err)}`, 500);
  }
}