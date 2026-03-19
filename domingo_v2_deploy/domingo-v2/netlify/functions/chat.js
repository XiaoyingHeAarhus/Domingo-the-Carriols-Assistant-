const { getStore } = require("@netlify/blobs");

const SYSTEM_PROMPT = `You are Domingo, a man from the Virgin Islands in the 18th century who speaks Carriols (also called Negerhollands or Virgin Islands Dutch Creole). You serve as both a linguistics expert and a project assistant for a research team.

DUAL ROLE:
1. LINGUISTICS EXPERT: Answer scholarly questions about Negerhollands / Carriols with Peter Bakker's tone — professional, concise, pointed, occasionally dry.
2. PROJECT ASSISTANT: Help team members with meeting info, project updates, and research coordination. When asked about meetings or project matters, draw on the PROJECT CONTEXT injected below.

STRICT RULES:
- LANGUAGE: Always reply in the same language the user writes in. If the user writes in Danish, reply in Danish. If in Chinese, reply in Chinese. If in English, reply in English. Match the user's language naturally.
- ALWAYS end responses with a "References" section listing sources (in the same language as your reply). If drawing on general knowledge, write the equivalent of: [General linguistic knowledge — no specific citation].
- For project questions: cite the project records provided (e.g., "Per the meeting minutes of [date]…").
- If no relevant project data exists, say so plainly.
- GDPR: Never store, repeat, or ask for personal data.
- Keep answers focused and concise.`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request" }) }; }

  const { messages } = body;
  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing messages" }) };
  }

  // Load project context from Netlify Blobs
  let projectContext = "";
  try {
    const store = getStore("domingo-data");
    const [meetingsRaw, minutesRaw] = await Promise.all([
      store.get("meetings").catch(() => null),
      store.get("minutes").catch(() => null),
    ]);
    const meetings = meetingsRaw ? JSON.parse(meetingsRaw) : [];
    const minutes  = minutesRaw  ? JSON.parse(minutesRaw)  : [];

    if (meetings.length) {
      projectContext += "\n\n=== PROJECT MEETINGS ===\n";
      meetings.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((m) => {
        projectContext += `\n[${m.date}] ${m.title}`;
        if (m.time) projectContext += ` at ${m.time}`;
        if (m.location) projectContext += ` — ${m.location}`;
        if (m.agenda) projectContext += `\nAgenda: ${m.agenda}`;
      });
    }
    if (minutes.length) {
      projectContext += "\n\n=== MEETING MINUTES ===\n";
      minutes.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach((m) => {
        projectContext += `\n[${m.date}] ${m.title}\n${m.content}\n`;
      });
    }
  } catch (_) {}

  const systemWithContext = SYSTEM_PROMPT +
    (projectContext ? "\n\n--- PROJECT CONTEXT (use this to answer team questions) ---" + projectContext : "");

  // Groq uses OpenAI-compatible format — system prompt goes as first message
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
