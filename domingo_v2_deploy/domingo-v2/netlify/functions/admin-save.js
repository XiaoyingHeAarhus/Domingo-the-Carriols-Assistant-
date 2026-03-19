// POST /api/admin-save  — save a meeting or minutes item
// POST /api/admin-delete — delete a meeting, minutes, or reminder
const crypto = require("crypto");
const { createClient } = require("@netlify/blobs");

function verifyToken(token) {
  if (!token) return false;
  const secret = process.env.TOKEN_SECRET || "domingo-secret-change-me";
  const [expires, sig] = token.split(".");
  if (!expires || !sig) return false;
  if (Date.now() > parseInt(expires)) return false;
  const expected = crypto.createHmac("sha256", secret).update(expires).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
}

async function getList(store, key) {
  const raw = await store.get(key).catch(() => null);
  return raw ? JSON.parse(raw) : [];
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const headers = { "Content-Type": "application/json" };
  const token = event.headers["x-admin-token"];
  if (!verifyToken(token)) return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request" }) }; }

  const store = createClient({ name: "domingo-data" });
  const action = event.path.includes("admin-delete") ? "delete" : "save";

  try {
    if (action === "save") {
      const { type, item } = body;
      const key = type === "meeting" ? "meetings" : "minutes";
      const list = await getList(store, key);
      const idx = list.findIndex((x) => x.id === item.id);
      if (idx > -1) list[idx] = item;
      else list.push(item);
      await store.set(key, JSON.stringify(list));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === "delete") {
      const { type, id } = body;
      const keyMap = { meeting: "meetings", minutes: "minutes", reminder: "reminders" };
      const key = keyMap[type];
      if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown type" }) };
      const list = await getList(store, key);
      const filtered = list.filter((x) => x.id !== id);
      await store.set(key, JSON.stringify(filtered));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
