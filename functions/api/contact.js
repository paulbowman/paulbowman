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