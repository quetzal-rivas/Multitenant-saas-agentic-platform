import type { NextRequest } from 'next/server';

/**
 * The public origin the browser used (e.g. https://www.contextcontrol.com.mx). Behind
 * Amplify/CloudFront `req.nextUrl.origin` is the internal server address, so prefer
 * APP_URL, then the forwarded host headers.
 */
export function publicOrigin(req: NextRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim();
  if (host && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
    return `${proto === 'http' ? 'http' : 'https'}://${host}`;
  }
  return req.nextUrl.origin;
}
