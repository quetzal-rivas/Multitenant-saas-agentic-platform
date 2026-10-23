import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

/**
 * Transactional email through Amazon SES (the app's compute role may send from the verified
 * domain). Without NOTICE_EMAIL_FROM nothing is sent and callers record the notice as not
 * emailed. Staging's SES is in the sandbox: a recipient outside the domain is rejected, which
 * counts as not emailed (not an error to retry).
 */

let client: SESv2Client | null = null;

export function emailConfigured(): boolean {
  return !!process.env.NOTICE_EMAIL_FROM;
}

export async function sendEmail(to: string[], subject: string, text: string): Promise<boolean> {
  const from = process.env.NOTICE_EMAIL_FROM;
  if (!from || to.length === 0) return false;
  client ||= new SESv2Client({ region: process.env.SES_REGION || process.env.AWS_REGION });
  try {
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: `Context Control <${from}>`,
        Destination: { ToAddresses: to },
        Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' } } } },
      })
    );
  } catch (err) {
    if ((err as { name?: string })?.name === 'MessageRejected') {
      console.warn('[email] rejected by SES (sandbox recipient?):', (err as Error).message);
      return false;
    }
    throw err;
  }
  return true;
}
