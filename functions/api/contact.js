export async function onRequestGet({ request }) {
  return Response.redirect(new URL("/", request.url).toString(), 302);
}

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim();
  const message = String(form.get("message") || "").trim();

  if (!name || !email || !message) {
    return new Response("Missing required fields.", { status: 400 });
  }

  // Confirm env vars exist (no printing secrets)
  if (!env.TO_EMAIL || !env.FROM_EMAIL) {
    return new Response("Server misconfigured (missing email env vars).", { status: 500 });
  }

  return Response.redirect(new URL("/thanks.html", request.url).toString(), 303);
}

async function verifyTurnstile({ token, secret, ip }) {
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret,
      response: token,
      remoteip: ip || "",
    }),
  });
  return res.json();
}

export async function onRequestGet({ request }) {
  return Response.redirect(new URL("/", request.url).toString(), 302);
}

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim();
  const message = String(form.get("message") || "").trim();

  if (!name || !email || !message) {
    return new Response("Missing required fields.", { status: 400 });
  }

  // Turnstile (optional)
  if (env.TURNSTILE_SECRET) {
    const token = String(form.get("cf-turnstile-response") || "");
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const verify = await verifyTurnstile({
      token,
      secret: env.TURNSTILE_SECRET,
      ip,
    });

    if (!verify.success) {
      return new Response("Captcha failed. Please try again.", { status: 403 });
    }
  }

  return Response.redirect(new URL("/thanks.html", request.url).toString(), 303);
}
