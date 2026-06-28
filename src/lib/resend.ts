import { Resend } from "resend";

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is required");
    resend = new Resend(apiKey);
  }
  return resend;
}

/** Prototype/free tier: RESEND_TO_EMAIL overrides profile recipients when set. */
export function getDeliveryRecipients(profileRecipients: string[]): string[] {
  const envRecipient = process.env.RESEND_TO_EMAIL?.trim();
  if (envRecipient) return [envRecipient];
  return profileRecipients;
}

export async function sendNewsletterEmail(
  recipients: string[],
  subject: string,
  html: string,
  replyTo?: string
): Promise<{ id: string }> {
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "newsletter@yourdomain.com";
  const fromName = process.env.RESEND_FROM_NAME ?? "Newsletter Generator";

  const { data, error } = await getResend().emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: recipients,
    subject,
    html,
    replyTo: replyTo || process.env.RESEND_REPLY_TO || undefined,
  });

  if (error) {
    const hint =
      error.message.includes("testing emails to your own email")
        ? " Resend test mode: use onboarding@resend.dev as FROM and send only to your Resend signup email, or verify a domain at resend.com/domains."
        : "";
    throw new Error(`Resend send failed: ${error.message}${hint}`);
  }
  if (!data?.id) throw new Error("Resend returned no message id");
  return { id: data.id };
}

export async function sendFailureAlert(
  recipients: string[],
  runId: string,
  errorMessage: string
): Promise<void> {
  if (recipients.length === 0) return;

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "newsletter@yourdomain.com";
  const fromName = process.env.RESEND_FROM_NAME ?? "Newsletter Generator";

  await getResend().emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: recipients,
    subject: `[Alert] Newsletter generation failed (run ${runId.slice(0, 8)})`,
    html: `
      <h2>Newsletter Generation Failed</h2>
      <p>Run ID: <code>${runId}</code></p>
      <p>Error: ${errorMessage}</p>
      <p>Please check the app dashboard and try again.</p>
    `,
  });
}
