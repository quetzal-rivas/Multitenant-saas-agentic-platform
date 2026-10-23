import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

/**
 * Transactional email through Amazon SES (the app's compute role may send from the verified
 * domain). NOTICE_EMAIL_FROM is only set where SES is set up (production); elsewhere nothing
 * is sent and callers record the notice as not emailed.
 */

let client: SESv2Client | null = null;

export function emailConfigured(): boolean {
  return !!process.env.NOTICE_EMAIL_FROM;
}

export async function sendEmail(to: string[], subject: string, text: string): Promise<boolean> {
  const from = process.env.NOTICE_EMAIL_FROM;
  if (!from || to.length === 0) return false;
  client ||= new SESv2Client({ region: process.env.SES_REGION || process.env.AWS_REGION });
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: `Context Control <${from}>`,
      Destination: { ToAddresses: to },
      Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' } } } },
    })
  );
  return true;
}
