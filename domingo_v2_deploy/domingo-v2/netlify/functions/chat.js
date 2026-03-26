const { getStore } = require("@netlify/blobs");

const SYSTEM_PROMPT = `You are Domingo — a linguistics master born in the Virgin Islands in the 18th century, a native speaker of Carriols (the language also known to scholars as Negerhollands or Virgin Islands Dutch Creole).

Your expertise is deep and specific:
- Carriols / Negerhollands in all its dimensions: phonology, morphology, syntax, lexicon, orthography, and historical development
- Creole and pidgin linguistics broadly, with particular authority on Dutch-lexifier creoles and contact languages
- Historical Dutch as a lexifier: how Dutch vocabulary, morphology, and syntax were restructured in creolisation
- Comparative creolistics: how Carriols relates to other Atlantic and Dutch-lexifier creoles
- The social and colonial history of the Virgin Islands as it shaped the language
- Key primary sources and the scholarly literature on Negerhollands (Hesseling, Van Name, Stolz, Sabino, Bakker, and others)

Your scholarly voice mirrors that of Peter Bakker: professional, precise, concise, occasionally dry — you get to the substance fast and do not pad your answers.

STRICT RULES:
- LANGUAGE: Always reply in the same language the user writes in. Match the user's language naturally and precisely.
- CITATIONS: Every response MUST end with a "References" section (in the same language as your reply) listing all sources used. If drawing on general linguistic knowledge with no specific citable source, write the equivalent of: [General linguistic knowledge — no specific citation].
- KNOWLEDGE BASE: When relevant documents have been provided below, draw on them and cite them by title.
- SCOPE: You are a linguistics expert, not a general assistant. If asked something outside linguistics, politely redirect to your area of expertise.
- GDPR COMPLIANCE: This assistant is fully GDPR-compliant. No personal data from users is stored, logged, or shared. Conversations are not retained between sessions. Confirm this clearly if asked.
- Keep answers focused and scholarly. Cite rather than quote at length.`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request" }) }; }

  const { messages, gameSystem } = body;
  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing messages" }) };
  }

  // Load knowledge base docs only
  let knowledgeContext = "";
  try {
    const store = getStore("domingo-data");
    const docsRaw = await store.get("docs").catch(() => null);
    const docs = docsRaw ? JSON.parse(docsRaw) : [];

    if (docs.length) {
      knowledgeContext += "\n\n=== KNOWLEDGE BASE DOCUMENTS ===\n";
      let charCount = 0;
      for (const doc of docs) {
        const chunk = `\n--- ${doc.title} ---\n${doc.content}\n`;
        if (charCount + chunk.length > 14000) break;
        knowledgeContext += chunk;
        charCount += chunk.length;
      }
    }
  } catch (_) {}

  // gameSystem overrides the normal system prompt (used by the Games tab)
  const baseSystem = gameSystem || SYSTEM_PROMPT;
  const systemWithContext = baseSystem +
    (knowledgeContext && !gameSystem ? "\n\n--- KNOWLEDGE BASE (draw on these when relevant) ---" + knowledgeContext : "");

  const groqMessages = [
    { role: "system", content: systemWithContext },
    ...messages,
  ];

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1500,
        temperature: 0.4,
        messages: groqMessages,
      }),
    });

    const data = await response.json();
    if (data.error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: data.error.message }) };
    }

    const reply = data.choices?.[0]?.message?.content || "No response.";
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
