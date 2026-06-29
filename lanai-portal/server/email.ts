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
    subject: `You're invited to Lanai Lifestyle — ${tierLabel} Member Portal`,
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
You're invited to Lanai Lifestyle — ${tierLabel} Member Portal

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
