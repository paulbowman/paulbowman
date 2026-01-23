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
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
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

  const json = await res.json();
  return { ok: res.ok, json };
}

async function sendMailchannels({ to, from, fromName, subject, text, replyTo }) {
  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from, name: fromName || "Website Contact" },
    subject,
    content: [{ type: "text/plain", value: text }],
    reply_to: replyTo,
  };

  const res = await fetchWithTimeout(
    "https://api.mailchannels.net/tx/v1/send",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
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
  // Minimal logging breadcrumbs — shows up in Pages Functions logs
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

    // Turnstile
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
    } else {
      console.log("contact: turnstile bypassed");
    }

    if (bypassEmail) {
      console.log("contact: email bypassed -> redirect");
      return Response.redirect(new URL("/thanks.html", request.url).toString(), 303);
    }

    // MailChannels
    if (!env.TO_EMAIL || !env.FROM_EMAIL) {
      console.log("contact: missing TO_EMAIL/FROM_EMAIL");
      return textResponse("Server misconfigured (email env vars missing).", 500);
    }

    console.log("contact: sending email");
    const subject = `New message from ${env.SITE_NAME || "paulbowman.us"}`;
    const text = `Name: ${name}\nEmail: ${email}\n\n${message}\n`;

    const sendRes = await sendMailchannels({
      to: env.TO_EMAIL,
      from: env.FROM_EMAIL,
      fromName: env.FROM_NAME || "Paul Bowman",
      subject,
      text,
      replyTo: { email, name },
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      console.log("contact: mailchannels failed", sendRes.status, err);
      return textResponse(`Email send failed (${sendRes.status}).\n\n${err}`, 502);
    }

    console.log("contact: success -> redirect");
    return Response.redirect(new URL("/thanks.html", request.url).toString(), 303);
  } catch (err) {
    console.log("contact: unhandled error", String(err?.message || err));
    return textResponse(`Unhandled error: ${err?.message || String(err)}`, 500);
  }
}