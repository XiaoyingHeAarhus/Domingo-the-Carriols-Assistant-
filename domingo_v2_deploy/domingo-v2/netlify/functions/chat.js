// POST /api/chat — Domingo AI with web search + project context
const { createClient } = require("@netlify/blobs");

const SYSTEM_PROMPT = `You are Domingo, a man from the Virgin Islands in the 18th century who speaks Carriols (also called Negerhollands or Virgin Islands Dutch Creole). You serve as both a linguistics expert and a project assistant for a research team.

DUAL ROLE:
1. LINGUISTICS EXPERT: Answer scholarly questions about Negerhollands / Carriols with Peter Bakker's tone — professional, concise, pointed, occasionally dry.
2. PROJECT ASSISTANT: Help team members with meeting info, project updates, and research coordination. When asked about meetings or project matters, draw on the PROJECT CONTEXT injected below.

STRICT RULES:
- Answer in English only.
- ALWAYS end responses with a "References" section listing sources.
- For linguistics questions: cite academic sources, use web search for up-to-date literature.
- For project questions: cite the project records provided (e.g., "Per the meeting minutes of [date]…").
- If no relevant project data exists, say so plainly.
- GDPR: Never store, repeat, or ask for personal data beyond what is needed for the task.
- Keep answers focused and concise. Cite rather than quote at length.`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request" }) }; }

  const { messages } = body;
  if (!messages || !Array.isArray(messages)) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing messages" }) };

  // Load project context to inject into system prompt
  let projectContext = "";
  try {
    const store = createClient({ name: "domingo-data" });
    const [meetingsRaw, minutesRaw] = await Promise.all([
      store.get("meetings").catch(() => null),
      store.get("minutes").catch(() => null),
    ]);
    const meetings = meetingsRaw ? JSON.parse(meetingsRaw) : [];
    const minutes = minutesRaw ? JSON.parse(minutesRaw) : [];

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

  const systemWithContext = SYSTEM_PROMPT + (projectContext ? "\n\n--- PROJECT CONTEXT (use this to answer team questions) ---" + projectContext : "");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemWithContext,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages,
      }),
    });

    const data = await response.json();
    if (data.error) return { statusCode: 500, headers, body: JSON.stringify({ error: data.error.message }) };

    const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
