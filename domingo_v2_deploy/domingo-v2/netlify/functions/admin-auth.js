// POST /api/admin-auth
const crypto = require("crypto");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const headers = { "Content-Type": "application/json" };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request" }) }; }

  const adminPassword = process.env.ADMIN_PASSWORD || "domingo2026";
  if (body.password !== adminPassword) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false }) };
  }

  // Simple HMAC token valid for 8 hours
  const secret = process.env.TOKEN_SECRET || "domingo-secret-change-me";
  const expires = Date.now() + 8 * 60 * 60 * 1000;
  const payload = `${expires}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const token = `${expires}.${sig}`;

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, token }) };
};
