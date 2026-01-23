async function sendMail({ to, from, fromName, subject, text, replyTo }) {
  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from, name: fromName || "Website Contact" },
    subject,
    content: [{ type: "text/plain", value: text }],
    reply_to: replyTo,
  };

  const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  return res;
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

  // (optional) Turnstile verification would go here

  const subject = `New message from ${env.SITE_NAME || "paulbowman.us"}`;
  const text = `Name: ${name}\nEmail: ${email}\n\n${message}\n`;

  const sendRes = await sendMail({
    to: env.TO_EMAIL,
    from: env.FROM_EMAIL,
    fromName: env.FROM_NAME || "Paul Bowman",
    subject,
    text,
    replyTo: { email, name },
  });

  if (!sendRes.ok) {
    const err = await sendRes.text();
    return new Response(`Email send failed.\n\n${err}`, { status: 502 });
  }

  return Response.redirect(new URL("/thanks.html", request.url).toString(), 303);
}