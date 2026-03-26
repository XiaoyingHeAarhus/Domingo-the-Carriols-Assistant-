const { getDeployStore: getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const store = getStore("domingo-data");

    const [meetingsRaw, minutesRaw, remindersRaw, docsRaw] = await Promise.all([
      store.get("meetings").catch(() => null),
      store.get("minutes").catch(() => null),
      store.get("reminders").catch(() => null),
      store.get("docs").catch(() => null),
    ]);

    const meetings  = meetingsRaw  ? JSON.parse(meetingsRaw)  : [];
    const minutes   = minutesRaw   ? JSON.parse(minutesRaw)   : [];
    const reminders = remindersRaw ? JSON.parse(remindersRaw) : [];
    const docs      = docsRaw      ? JSON.parse(docsRaw)      : [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ meetings, minutes, reminders, docs }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ meetings: [], minutes: [], reminders: [], error: err.message }),
    };
  }
};
