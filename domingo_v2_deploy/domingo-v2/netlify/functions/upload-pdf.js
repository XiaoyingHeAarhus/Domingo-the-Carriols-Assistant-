// POST /api/upload-pdf
// Extracts text from PDF and stores in Knowledge Base
// Supports large files: auto-splits into chunks if > 50KB
const { getStore } = require("@netlify/blobs");
const crypto = require("crypto");
const pdfParse = require("pdf-parse");

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

function cleanText(text) {
  return text
    .replace(/\f/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{3,}/g, " ")
    .trim();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const headers = { "Content-Type": "application/json" };

  const token = event.headers["x-admin-token"];
  if (!verifyToken(token)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request" }) }; }

  const { title, fileBase64, fileName, chunkSize = 45000 } = body;
  if (!title || !fileBase64) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing title or file" }) };
  }

  try {
    const buffer = Buffer.from(fileBase64, "base64");

    if (buffer.length > 15 * 1024 * 1024) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "PDF too large. Max 15MB." }) };
    }

    const data = await pdfParse(buffer, { max: 0 });
    let text = cleanText(data.text || "");

    if (!text || text.length < 50) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Could not extract text. The PDF may be scanned/image-only. Try an OCR-processed version." }),
      };
    }

    const store = getStore("domingo-data");
    const docsRaw = await store.get("docs").catch(() => null);
    const docs = docsRaw ? JSON.parse(docsRaw) : [];

    const CHUNK = chunkSize;
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK) {
      chunks.push(text.slice(i, i + CHUNK));
    }

    const timestamp = Date.now();
    const newDocs = chunks.map((chunk, idx) => ({
      id: `doc-${timestamp}-${idx}`,
      title: chunks.length > 1 ? `${title} (part ${idx + 1}/${chunks.length})` : title,
      content: chunk,
      sourceFile: fileName || "unknown.pdf",
      pages: data.numpages || "?",
      createdAt: new Date().toISOString(),
    }));

    docs.push(...newDocs);
    await store.set("docs", JSON.stringify(docs));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        totalChars: text.length,
        chunks: chunks.length,
        pages: data.numpages,
        ids: newDocs.map(d => d.id),
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "PDF processing failed: " + err.message }) };
  }
};
