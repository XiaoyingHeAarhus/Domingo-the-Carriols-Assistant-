const { getDeployStore: getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request" }) }; }

  const { meetingId, email, minutesBefore } = body;
  if (!meetingId || !email) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing fields" }) };
  if (!email.includes("@") || email.length > 254) return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid email" }) };

  try {
    const store = getStore("domingo-data");

    const meetingsRaw = await store.get("meetings").catch(() => null);
    const meetings = meetingsRaw ? JSON.parse(meetingsRaw) : [];
    const meeting = meetings.find((m) => m.id === meetingId);

    const remindersRaw = await store.get("reminders").catch(() => null);
    const reminders = remindersRaw ? JSON.parse(remindersRaw) : [];
    const reminder = {
      id: "r-" + Date.now(),
      meetingId,
      email,
      minutesBefore: minutesBefore || 60,
      createdAt: new Date().toISOString(),
    };
    reminders.push(reminder);
    await store.set("reminders", JSON.stringify(reminders));

    // Send email via EmailJS if configured
    const { EMAILJS_SERVICE_ID: serviceId, EMAILJS_TEMPLATE_ID: templateId,
            EMAILJS_PUBLIC_KEY: publicKey, EMAILJS_PRIVATE_KEY: privateKey } = process.env;

    if (serviceId && templateId && publicKey && privateKey && meeting) {
      await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId, template_id: templateId,
          user_id: publicKey, accessToken: privateKey,
          template_params: {
            to_email: email,
            meeting_title: meeting.title || "Meeting",
            meeting_date: meeting.date || "",
            meeting_time: meeting.time || "",
            meeting_location: meeting.location || "See meeting link",
            meeting_link: meeting.link || "",
            reminder_minutes: minutesBefore || 60,
          },
        }),
      });
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
