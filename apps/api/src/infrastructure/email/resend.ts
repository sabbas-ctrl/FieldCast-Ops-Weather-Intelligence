import { env } from "../../config/env.js";
import { HttpError } from "../../utils/http.js";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

type ResendEmailResult = {
  id?: string;
  skipped: boolean;
  reason?: string;
};

function configuredForEmail() {
  return Boolean(env.RESEND_API_KEY?.trim() && env.RESEND_FROM?.trim());
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resendErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.name;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}

export function invitationEmail(input: {
  workspaceName: string;
  inviteLink: string;
  role: string;
  inviterName?: string;
}) {
  const workspaceName = escapeHtml(input.workspaceName);
  const role = escapeHtml(input.role.replace(/_/g, " "));
  const inviteLink = escapeHtml(input.inviteLink);
  const inviterName = input.inviterName ? escapeHtml(input.inviterName) : "A workspace administrator";

  return {
    subject: `You're invited to ${input.workspaceName} on FieldCast Ops`,
    text: `${input.inviterName ?? "A workspace administrator"} invited you to join ${input.workspaceName} as ${input.role.replace(/_/g, " ")}.\n\nAccept the invite: ${input.inviteLink}\n\nThis invitation expires in 7 days.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:560px">
        <h1 style="font-size:22px;margin:0 0 12px">Join ${workspaceName}</h1>
        <p>${inviterName} invited you to FieldCast Ops as <strong>${role}</strong>.</p>
        <p>
          <a href="${inviteLink}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:10px 14px;border-radius:6px">
            Accept invitation
          </a>
        </p>
        <p style="font-size:13px;color:#64748b">This invitation expires in 7 days. If the button does not work, paste this URL into your browser:</p>
        <p style="font-size:13px;word-break:break-all;color:#334155">${inviteLink}</p>
      </div>
    `
  };
}

export async function sendEmail(input: SendEmailInput): Promise<ResendEmailResult> {
  if (!configuredForEmail()) {
    return {
      skipped: true,
      reason: "RESEND_API_KEY and RESEND_FROM are not configured"
    };
  }

  const response = await fetch(`${env.RESEND_API_URL.replace(/\/$/, "")}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(env.RESEND_REPLY_TO ? { reply_to: env.RESEND_REPLY_TO } : {})
    })
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text();
  if (!response.ok) {
    throw new HttpError(
      response.status >= 500 ? 502 : response.status,
      `Resend email failed: ${resendErrorMessage(payload, `provider status ${response.status}`)}`,
      payload
    );
  }

  return {
    id: payload && typeof payload === "object" && "id" in payload ? String((payload as { id: unknown }).id) : undefined,
    skipped: false
  };
}
