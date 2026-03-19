// GET /api/data — returns all meetings, minutes, reminders (public read)
const { createClient } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const store = createClient({ name: "domingo-data" });

    const [meetingsRaw, minutesRaw, remindersRaw] = await Promise.all([
      store.get("meetings").catch(() => null),
      store.get("minutes").catch(() => null),
      store.get("reminders").catch(() => null),
    ]);

    const meetings = meetingsRaw ? JSON.parse(meetingsRaw) : [];
    const minutes = minutesRaw ? JSON.parse(minutesRaw) : [];
    const reminders = remindersRaw ? JSON.parse(remindersRaw) : [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ meetings, minutes, reminders }),
    };
  } catch (err) {
    // Return empty data if blobs not yet initialised
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ meetings: [], minutes: [], reminders: [] }),
    };
  }
};
