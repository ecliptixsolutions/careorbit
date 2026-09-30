import type { IncomingMessage, ServerResponse } from "node:http";

type NotificationRequest = {
  phone?: string;
  message?: string;
};

function readBody(request: IncomingMessage & { body?: unknown }): NotificationRequest {
  if (request.body && typeof request.body === "object") {
    return request.body as NotificationRequest;
  }
  return {};
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `+${digits}`;
}

function getSessionCookie(request: IncomingMessage): string | null {
  const cookieHeader = request.headers.cookie || "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key.trim() === "careorbit_session") return rest.join("=").trim();
  }
  return null;
}

export default async function handler(
  request: IncomingMessage & { body?: unknown },
  response: ServerResponse & {
    status: (code: number) => typeof response;
    json: (body: unknown) => void;
  },
) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Authenticate via MySQL session cookie — no Supabase dependency
  const sessionId = getSessionCookie(request);
  if (!sessionId) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  // Validate session against the Express API running on the same host
  const apiBase = process.env.API_BASE_URL || "http://localhost:3001";
  const meResponse = await fetch(`${apiBase}/api/auth/me`, {
    headers: { Cookie: `careorbit_session=${sessionId}` },
  });
  if (!meResponse.ok) {
    response.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const { phone, message } = readBody(request);
  if (!phone || !message) {
    response.status(400).json({ error: "Phone and message are required" });
    return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
  const smsFrom = process.env.TWILIO_SMS_FROM;
  const from = whatsappFrom ?? smsFrom;

  if (!accountSid || !authToken || !from) {
    response.status(503).json({
      error: "Phone notification provider is not configured",
      code: "PROVIDER_NOT_CONFIGURED",
    });
    return;
  }

  const useWhatsApp = Boolean(whatsappFrom);
  const to = normalizePhone(phone);
  const form = new URLSearchParams({
    From: useWhatsApp ? `whatsapp:${from.replace(/^whatsapp:/, "")}` : from,
    To: useWhatsApp ? `whatsapp:${to}` : to,
    Body: message.slice(0, 1500),
  });
  const twilioResponse = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
    },
  );
  const result = (await twilioResponse.json()) as { sid?: string; message?: string };

  if (!twilioResponse.ok) {
    response.status(502).json({ error: result.message ?? "Phone notification failed" });
    return;
  }

  response.status(200).json({
    delivered: true,
    channel: useWhatsApp ? "whatsapp" : "sms",
    messageId: result.sid,
  });
}
