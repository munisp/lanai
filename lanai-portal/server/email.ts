/**
 * Email service using Resend.
 * RESEND_API_KEY must be set in environment variables.
 * FROM_EMAIL defaults to onboarding@resend.dev (Resend sandbox) if not set.
 */
import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
    _resend = new Resend(apiKey);
  }
  return _resend;
}

const FROM_EMAIL =
  process.env.FROM_EMAIL ?? "Lanai Lifestyle <onboarding@resend.dev>";

export interface SendInvitationEmailParams {
  toEmail: string;
  toName: string;
  inviteUrl: string;
  advisorName: string;
  memberTier: string;
  expiresHours?: number;
}

export async function sendInvitationEmail(
  params: SendInvitationEmailParams
): Promise<{ id: string }> {
  const {
    toEmail,
    toName,
    inviteUrl,
    advisorName,
    memberTier,
    expiresHours = 72,
  } = params;

  const tierLabel =
    memberTier.charAt(0).toUpperCase() + memberTier.slice(1);

  const resend = getResend();

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [toEmail],
    subject: `You're invited to Lanai Lifestyle : ${tierLabel} Member Portal`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lanai Lifestyle Invitation</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#1a2e1a;padding:40px 48px 32px;">
              <p style="margin:0;color:#c9a84c;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:'Arial',sans-serif;">
                LANAI LIFESTYLE
              </p>
              <h1 style="margin:12px 0 0;color:#ffffff;font-size:28px;font-weight:400;line-height:1.3;">
                Your private portal<br/>awaits, ${toName.split(" ")[0]}.
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 48px;">
              <p style="margin:0 0 20px;color:#444;font-size:16px;line-height:1.7;">
                ${advisorName} has invited you to join the Lanai Lifestyle member portal as a
                <strong style="color:#1a2e1a;">${tierLabel}</strong> member.
              </p>
              <p style="margin:0 0 32px;color:#444;font-size:16px;line-height:1.7;">
                Through your portal you can view your curated itineraries, submit travel requests,
                and communicate directly with your dedicated advisor.
              </p>
              <!-- CTA -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1a2e1a;border-radius:3px;">
                    <a href="${inviteUrl}"
                       style="display:inline-block;padding:16px 36px;color:#c9a84c;font-family:'Arial',sans-serif;font-size:14px;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;">
                      Set Up My Portal Access
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;color:#888;font-size:13px;line-height:1.6;font-family:'Arial',sans-serif;">
                This invitation expires in ${expiresHours} hours. If you did not expect this invitation,
                you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f7;padding:24px 48px;border-top:1px solid #e8e8e0;">
              <p style="margin:0;color:#aaa;font-size:12px;font-family:'Arial',sans-serif;line-height:1.6;">
                Lanai Lifestyle · Private Client Services<br/>
                If the button above doesn't work, copy and paste this link into your browser:<br/>
                <a href="${inviteUrl}" style="color:#1a2e1a;word-break:break-all;">${inviteUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
    text: `
You're invited to Lanai Lifestyle : ${tierLabel} Member Portal

${advisorName} has invited you to join the Lanai Lifestyle member portal as a ${tierLabel} member.

Set up your portal access here:
${inviteUrl}

This invitation expires in ${expiresHours} hours.

Lanai Lifestyle · Private Client Services
    `.trim(),
  });

  if (error) {
    throw new Error(`Failed to send invitation email: ${error.message}`);
  }

  return { id: data!.id };
}

// ─── Client booking confirmation (white-labeled from supplier emails) ───────

export interface ClientConfirmationExtraction {
  property_name?: string | null;
  supplier?: string | null;
  client_name?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  room_category?: string | null;
  booking_reference?: string | null;
  amount?: string | null;
  virtuoso_perks?: string[] | null;
  notes?: string | null;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "TBC";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

/** Plain-text Lanai confirmation draft for WhatsApp review-and-send. */
export function renderClientConfirmationText(
  e: ClientConfirmationExtraction,
  clientName: string,
): string {
  const first = clientName.split(" ")[0] || "there";
  const perks = (e.virtuoso_perks ?? [])
    .map((p) => `  - ${p}`)
    .join("\n");
  const property = e.property_name ?? "your stay";
  const room = e.room_category ? ` (${e.room_category})` : "";
  return `Dear ${first},

We are delighted to confirm ${property}${room}.
Dates: ${fmtDate(e.check_in)} to ${fmtDate(e.check_out)}.
Booking reference: ${e.booking_reference ?? "TBC"}.
${e.amount ? `Total: ${e.amount}.` : ""}
${perks ? `Your Virtuoso benefits:\n${perks}\n` : ""}Should you need anything at all, simply reply and I will be right with you.

Warm regards,
Bolanle
Lanai Lifestyle, Private Client Services`.trim();
}

/** Send the Lanai-branded confirmation email to the client (advisor review-and-send). */
export async function sendClientConfirmationEmail(input: {
  toEmail: string;
  toName: string;
  extraction: ClientConfirmationExtraction;
}): Promise<{ id: string }> {
  const e = input.extraction;
  const first = input.toName.split(" ")[0] || "there";
  const property = e.property_name ?? "your stay";
  const perks = (e.virtuoso_perks ?? [])
    .map(
      (p) =>
        `<li style="margin:6px 0;color:#444;font-size:15px;">${p}</li>`,
    )
    .join("");
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden;">
        <tr>
          <td style="background:#1a2e1a;padding:40px 48px 32px;">
            <p style="margin:0;color:#c9a84c;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:'Arial',sans-serif;">LANAI LIFESTYLE</p>
            <h1 style="margin:12px 0 0;color:#ffffff;font-size:26px;font-weight:400;line-height:1.3;">Your booking is<br/>confirmed, ${first}.</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 48px;">
            <p style="margin:0 0 24px;color:#444;font-size:16px;line-height:1.7;">We are delighted to confirm <strong style="color:#1a2e1a;">${property}</strong>${e.room_category ? ` (${e.room_category})` : ""}.</p>
            <table cellpadding="0" cellspacing="0" width="100%" style="font-size:15px;color:#444;line-height:1.8;">
              <tr><td style="color:#888;width:160px;">Check in</td><td>${fmtDate(e.check_in)}</td></tr>
              <tr><td style="color:#888;">Check out</td><td>${fmtDate(e.check_out)}</td></tr>
              <tr><td style="color:#888;">Booking reference</td><td>${e.booking_reference ?? "TBC"}</td></tr>
              ${e.amount ? `<tr><td style="color:#888;">Total</td><td><strong style="color:#1a2e1a;">${e.amount}</strong></td></tr>` : ""}
            </table>
            ${perks ? `<h2 style="margin:28px 0 12px;color:#1a2e1a;font-size:14px;letter-spacing:1px;text-transform:uppercase;font-family:'Arial',sans-serif;">Your Virtuoso benefits</h2><ul style="margin:0;padding:0 0 0 18px;">${perks}</ul>` : ""}
            <p style="margin:28px 0 0;color:#888;font-size:13px;line-height:1.6;font-family:'Arial',sans-serif;">Should you need anything at all, simply reply to this email and I will be right with you.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f7;padding:24px 48px;border-top:1px solid #e8e8e0;">
            <p style="margin:0;color:#aaa;font-size:12px;font-family:'Arial',sans-serif;line-height:1.6;">Bolanle<br/>Lanai Lifestyle, Private Client Services</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim();
  const text = renderClientConfirmationText(e, input.toName);
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [input.toEmail],
    subject: `Your Lanai confirmation${e.property_name ? `: ${e.property_name}` : ""}`,
    html,
    text,
  });
  if (error) {
    throw new Error(`Failed to send confirmation email: ${error.message}`);
  }
  return { id: data!.id };
}
