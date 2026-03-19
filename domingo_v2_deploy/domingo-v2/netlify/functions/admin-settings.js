// POST /api/admin-settings
const crypto = require("crypto");

function verifyToken(token) {
  if (!token) return false;
  const secret = process.env.TOKEN_SECRET || "domingo-secret-change-me";
  const [expires, sig] = token.split(".");
  if (!expires || !sig) return false;
  if (Date.now() > parseInt(expires)) return false;
  try {
    const expected = crypto.createHmac("sha256", secret).update(expires).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch { return false; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const headers = { "Content-Type": "application/json" };
  const token = event.headers["x-admin-token"];
  if (!verifyToken(token)) return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };

  // Password changes require updating Netlify env vars — this just validates and reminds.
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, note: "Update ADMIN_PASSWORD in Netlify site settings > Environment variables, then redeploy." }),
  };
};
