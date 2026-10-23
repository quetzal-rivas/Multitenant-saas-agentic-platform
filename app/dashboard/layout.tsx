import React from 'react';

// Private, per-account page: rendered on every request so the middleware always checks the
// session and the organization, and never cached by the browser or the CDN (a cached copy was
// served after signing out).
export const dynamic = 'force-dynamic';

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
