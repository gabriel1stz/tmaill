/**
 * Cloudflare Email Worker for RIELL MAIL by RIELLPEDIA
 * Intercepts incoming emails routed by Cloudflare Email Routing
 * and forwards parsed details to the Next.js Internal Webhook API.
 */
export default {
  async email(message, env, ctx) {
    const recipient = message.to;
    const sender = message.from;
    const subject = message.headers.get("subject") || "(No Subject)";
    const messageId = message.headers.get("message-id") || "";

    let bodyText = "";
    let bodyHtml = "";

    try {
      // Read raw email bytes
      const rawEmailReader = message.raw.getReader();
      let chunks = [];
      let totalLength = 0;

      while (true) {
        const { done, value } = await rawEmailReader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
      }

      const rawBytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        rawBytes.set(chunk, offset);
        offset += chunk.length;
      }

      const rawText = new TextDecoder("utf-8").decode(rawBytes);

      // Simple MIME parsing fallback
      if (rawText.includes("Content-Type: text/html")) {
        const parts = rawText.split(/Content-Type:\s*text\/html[^\r\n]*/i);
        if (parts.length > 1) {
          bodyHtml = parts[1].split(/--[a-zA-Z0-9_-]+/)[0].trim();
        }
      }

      if (rawText.includes("Content-Type: text/plain") || !bodyHtml) {
        const parts = rawText.split(/Content-Type:\s*text\/plain[^\r\n]*/i);
        if (parts.length > 1) {
          bodyText = parts[1].split(/--[a-zA-Z0-9_-]+/)[0].trim();
        } else {
          bodyText = rawText;
        }
      }
    } catch (err) {
      console.error("Error reading raw email body:", err);
      bodyText = "Could not parse email raw content.";
    }

    const payload = {
      recipient,
      sender,
      subject,
      messageId,
      bodyText,
      bodyHtml: bodyHtml || bodyText,
      size: message.rawSize || 0,
    };

    const webhookUrl = env.RIELL_MAIL_WEBHOOK_URL || "https://mail.riellpedia.com/api/internal/email/incoming";
    const webhookSecret = env.EMAIL_HANDLER_SECRET || "";

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
        console.error(`Webhook returned error status: ${response.status}`);
        message.setReject(`RIELL MAIL: Delivery rejected by server (${response.status})`);
      }
    } catch (error) {
      console.error("Error forwarding email to RIELL MAIL API:", error);
      message.setReject("RIELL MAIL: Internal delivery error");
    }
  },
};
