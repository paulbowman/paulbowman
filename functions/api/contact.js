export async function onRequestPost(context) {
  const { request, env } = context;

  // 1) Parse form body
  const form = await request.formData();
  const name = (form.get("name") || "").toString().trim();
  const email = (form.get("email") || "").toString().trim();
  const message = (form.get("message") || "").toString().trim();
  const token = (form.get("cf-turnstile-response") || "").toString();

  // Basic validation
  if (!name || !email || !message) {
    return new Response("Missing required fields.", { status: 400 });
  }

  // 2) Verify Turnstile (recommended)
  if (env.TURNSTILE_SECRET) {
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip: ip,
      }),
    });

    const verify = await verifyRes.json();
    if (!verify.success) {
      return new Response("Captcha failed. Please try again.", { status: 403 });
    }
  }

  // 3) Send email via MailChannels
  // NOTE: This requires MailChannels Domain Lockdown DNS TXT record (Step 4)
  const subject = `New message from ${env.SITE_NAME || "your site"}`;
  const text = `Name: ${name}\nEmail: ${email}\n\n${message}\n`;

  const mailPayload = {
    personalizations: [{ to: [{ email: env.TO_EMAIL }] }],
    from: { email: env.FROM_EMAIL, name: env.FROM_NAME || "Website Contact" },
    subject,
    content: [{ type: "text/plain", value: text }],
    reply_to: { email, name },
  };

  const sendRes = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(mailPayload),
  });

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    return new Response(`Email send failed.\n\n${errText}`, { status: 502 });
  }

  // 4) Redirect to thank-you page (white-labeled)
  return Response.redirect(new URL("/thanks.html", request.url).toString(), 303);
}
