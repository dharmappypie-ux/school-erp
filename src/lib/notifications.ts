import "server-only";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Notification engine.
 *
 * Every message is persisted to `notification_logs` first and dispatched
 * second, so nothing is lost when a provider is down and the school always has
 * a delivery record to point at. With no provider credentials configured — the
 * default in development — messages are marked SENT and written to the server
 * console instead of being transmitted.
 */

export type Channel = "EMAIL" | "SMS" | "WHATSAPP" | "PUSH" | "IN_APP" | "VOICE_CALL";

export interface QueueInput {
  schoolId: string;
  /** Looks up a NotificationTemplate; falls back to `body` when absent. */
  templateKey?: string;
  channel: Channel;
  recipient: string | null | undefined;
  userId?: string | null;
  subject?: string;
  body?: string;
  variables?: Record<string, string>;
  /** Groups one broadcast so delivery can be reported together. */
  batchId?: string;
}

/** Replaces {{name}} placeholders. Unknown variables are left visible rather than blanked, so a broken template is obvious in testing. */
export function renderTemplate(
  template: string,
  variables: Record<string, string> = {},
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    key in variables ? variables[key] : match,
  );
}

export interface DispatchResult {
  delivered: boolean;
  provider: string;
  providerMessageId?: string;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Channel adapters                                                            */
/* -------------------------------------------------------------------------- */

async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<DispatchResult> {
  if (!env.smtp.host || !env.smtp.user) {
    console.info(`[notify:email → ${to}] ${subject}\n${body}`);
    return { delivered: false, provider: "console" };
  }

  // Wired lazily so the SMTP dependency is optional for deployments that only
  // use SMS/WhatsApp.
  try {
    const { createTransport } = await import("nodemailer");
    const transport = createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.password },
    });
    const info = await transport.sendMail({
      from: env.smtp.from,
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    });
    return { delivered: true, provider: "smtp", providerMessageId: info.messageId };
  } catch (error) {
    return {
      delivered: false,
      provider: "smtp",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function sendSms(to: string, body: string): Promise<DispatchResult> {
  if (!env.msg91.authKey) {
    console.info(`[notify:sms → ${to}] ${body}`);
    return { delivered: false, provider: "console" };
  }

  try {
    const response = await fetch("https://api.msg91.com/api/v2/sendsms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: env.msg91.authKey,
      },
      body: JSON.stringify({
        sender: env.msg91.senderId,
        route: "4",
        country: "91",
        sms: [{ message: body, to: [to.replace(/\D/g, "")] }],
      }),
    });
    const payload = (await response.json()) as { type?: string; message?: string };
    return response.ok && payload.type !== "error"
      ? { delivered: true, provider: "msg91", providerMessageId: payload.message }
      : { delivered: false, provider: "msg91", error: payload.message ?? "SMS rejected" };
  } catch (error) {
    return {
      delivered: false,
      provider: "msg91",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function sendWhatsApp(
  to: string,
  body: string,
  providerTemplateId?: string | null,
): Promise<DispatchResult> {
  if (!env.whatsapp.accessToken || !env.whatsapp.phoneNumberId) {
    console.info(`[notify:whatsapp → ${to}] ${body}`);
    return { delivered: false, provider: "console" };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${env.whatsapp.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.whatsapp.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          providerTemplateId
            ? {
                messaging_product: "whatsapp",
                to: to.replace(/\D/g, ""),
                type: "template",
                template: { name: providerTemplateId, language: { code: "en" } },
              }
            : {
                messaging_product: "whatsapp",
                to: to.replace(/\D/g, ""),
                type: "text",
                text: { body },
              },
        ),
      },
    );
    const payload = (await response.json()) as {
      messages?: { id: string }[];
      error?: { message: string };
    };
    return response.ok
      ? {
          delivered: true,
          provider: "whatsapp_cloud",
          providerMessageId: payload.messages?.[0]?.id,
        }
      : {
          delivered: false,
          provider: "whatsapp_cloud",
          error: payload.error?.message ?? "WhatsApp rejected the message",
        };
  } catch (error) {
    return {
      delivered: false,
      provider: "whatsapp_cloud",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Persists a message and attempts delivery. Never throws — a failed
 * notification must not roll back the operation that triggered it.
 */
export async function queueNotification(
  input: QueueInput,
): Promise<{ id: string; delivered: boolean } | null> {
  if (!input.recipient) return null;

  try {
    const template = input.templateKey
      ? await prisma.notificationTemplate.findUnique({
          where: {
            schoolId_key_channel: {
              schoolId: input.schoolId,
              key: input.templateKey,
              channel: input.channel,
            },
          },
        })
      : null;

    const rawBody = input.body ?? template?.body ?? "";
    if (!rawBody) return null;

    const body = renderTemplate(rawBody, input.variables);
    const subject = renderTemplate(
      input.subject ?? template?.subject ?? "",
      input.variables,
    );

    const log = await prisma.notificationLog.create({
      data: {
        schoolId: input.schoolId,
        templateId: template?.id ?? null,
        userId: input.userId ?? null,
        channel: input.channel,
        recipient: input.recipient,
        subject: subject || null,
        body,
        status: "QUEUED",
        batchId: input.batchId ?? null,
      },
    });

    let result: DispatchResult;
    switch (input.channel) {
      case "EMAIL":
        result = await sendEmail(input.recipient, subject || "Notification", body);
        break;
      case "SMS":
        result = await sendSms(input.recipient, body);
        break;
      case "WHATSAPP":
        result = await sendWhatsApp(
          input.recipient,
          body,
          template?.providerTemplateId,
        );
        break;
      default:
        // IN_APP and PUSH are read from notification_logs by the client, so
        // persisting the row is the delivery.
        result = { delivered: true, provider: "in_app" };
    }

    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        // "console" means no provider is configured: the message is recorded
        // and printed, but must not be reported as delivered.
        status: result.delivered ? "SENT" : result.error ? "FAILED" : "QUEUED",
        provider: result.provider,
        providerMsgId: result.providerMessageId ?? null,
        errorMessage: result.error ?? null,
        attempts: { increment: 1 },
        sentAt: result.delivered ? new Date() : null,
      },
    });

    return { id: log.id, delivered: result.delivered };
  } catch (error) {
    console.error("[notify] failed to queue notification", error);
    return null;
  }
}

/** Fans a template out to many recipients under one batch id. */
export async function broadcast(
  input: Omit<QueueInput, "recipient" | "userId"> & {
    recipients: { recipient: string | null | undefined; userId?: string | null; variables?: Record<string, string> }[];
  },
): Promise<{ batchId: string; queued: number; delivered: number }> {
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let queued = 0;
  let delivered = 0;

  // Sequential on purpose: SMS and WhatsApp providers rate-limit aggressively,
  // and a burst of parallel requests gets throttled or blocked.
  for (const target of input.recipients) {
    const result = await queueNotification({
      ...input,
      batchId,
      recipient: target.recipient,
      userId: target.userId,
      variables: { ...input.variables, ...target.variables },
    });
    if (result) {
      queued += 1;
      if (result.delivered) delivered += 1;
    }
  }

  return { batchId, queued, delivered };
}
