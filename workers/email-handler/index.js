/**
 * Cloudflare Email Worker for RIELL MAIL by RIELLPEDIA
 * Intercepts incoming emails routed by Cloudflare Email Routing
 * and forwards raw MIME and parsed details to the Next.js Webhook API.
 */
export default {
  async email(message, env, ctx) {
    const recipient = message.to;
    const sender = message.from;
    const subject = message.headers.get("subject") || "(No Subject)";
    const messageId = message.headers.get("message-id") || "";

    let rawEmail = "";
    let bodyText = "";
    let bodyHtml = "";

    try {
      // Stream raw MIME RFC 2822 content
      rawEmail = await new Response(message.raw).text();

      // Basic fallback extraction
      if (rawEmail.includes("Content-Type: text/html")) {
        const parts = rawEmail.split(/Content-Type:\s*text\/html[^\r\n]*/i);
        if (parts.length > 1) {
          const bodyPart = parts[1].split(/--[a-zA-Z0-9_-]+/)[0];
          bodyHtml = bodyPart.trim();
        }
      }

      if (rawEmail.includes("Content-Type: text/plain")) {
        const parts = rawEmail.split(/Content-Type:\s*text\/plain[^\r\n]*/i);
        if (parts.length > 1) {
          const bodyPart = parts[1].split(/--[a-zA-Z0-9_-]+/)[0];
          bodyText = bodyPart.trim();
        }
      }

      if (!bodyText && !bodyHtml) {
        bodyText = rawEmail;
      }
    } catch (err) {
      console.error("Error reading raw email content:", err);
      rawEmail = "";
      bodyText = "(Could not parse raw email body text)";
    }

    const payload = {
      recipient,
      sender,
      subject,
      messageId,
      rawEmail,
      bodyText: bodyText || "(No text content)",
      bodyHtml: bodyHtml || bodyText || "(No content)",
      size: message.rawSize || rawEmail.length || 0,
    };

    const webhookUrl = env.RIELL_MAIL_WEBHOOK_URL || "https://r1el.my.id/api/email/incoming";
    const webhookSecret = env.EMAIL_HANDLER_SECRET || "cf_worker_webhook_secret_riellmail_2026_xyz";

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Email-Handler-Secret": webhookSecret,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Webhook error HTTP ${response.status}: ${errText}`);
      } else {
        console.log(`Email successfully forwarded for recipient ${recipient}`);
      }
    } catch (error) {
      console.error("Error forwarding email to RIELL MAIL API:", error);
    }
  },
};
