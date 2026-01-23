export async function onRequestGet({ request }) {
  return new Response("OK (GET)", { status: 200 });
}

export async function onRequestPost({ request }) {
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim();
  const message = String(form.get("message") || "").trim();

  if (!name || !email || !message) {
    return new Response("Missing required fields.", { status: 400 });
  }

  return Response.redirect(new URL("/thanks.html", request.url).toString(), 303);
}