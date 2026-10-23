import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Context Control — Universal context and hosted MCP for AI agents',
  description: 'Universal Context Control & Hosted MCP Server Hub with 1-click OAuth connections, custom tool profiles, and agent graph integration.',
  openGraph: {
    title: 'Context Control — Universal context and hosted MCP for AI agents',
    description: 'Universal Context Control & Hosted MCP Server Hub with 1-click OAuth connections, custom tool profiles, and agent graph integration.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Context Control — Universal context and hosted MCP for AI agents',
    description: 'Universal Context Control & Hosted MCP Server Hub with 1-click OAuth connections, custom tool profiles, and agent graph integration.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
