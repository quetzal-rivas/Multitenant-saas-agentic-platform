import { z } from 'zod';
import { ServiceError } from '@/lib/services/errors';
import type { ConnectorToolDef } from './registry';

/**
 * Direct Gmail / Calendar connector: used when Google's official MCP servers are not
 * available to the organization (personal Gmail, or Workspace outside the preview).
 */

interface DirectTool extends ConnectorToolDef {
  connectorId: 'gmail' | 'calendar';
  scope: string;
  schema: z.ZodType<any>;
  run: (token: string, args: any) => Promise<unknown>;
}

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary';

async function google(token: string, url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error?.message || res.statusText;
    throw new ServiceError(`Google API error (${res.status}): ${message}`, res.status === 401 || res.status === 403 ? 'FORBIDDEN' : 'CONFLICT');
  }
  return body;
}

const header = (msg: any, name: string) => msg.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

function bodyText(part: any): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  for (const p of part.parts || []) {
    const t = bodyText(p);
    if (t) return t;
  }
  if (part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8').replace(/<[^>]+>/g, ' ');
  return '';
}

const searchArgs = z.object({
  query: z.string().max(500).describe('Gmail search, e.g. "from:google.com newer_than:7d"'),
  max_results: z.number().int().min(1).max(25).optional(),
});
const readArgs = z.object({ message_id: z.string().min(1) });
const draftArgs = z.object({
  to: z.string().min(3).max(500),
  subject: z.string().max(300),
  body: z.string().max(20_000),
});
const listEventsArgs = z.object({
  from: z.string().datetime({ offset: true }).optional().describe('Start (ISO 8601). Default: now.'),
  to: z.string().datetime({ offset: true }).optional().describe('End (ISO 8601). Default: 7 days from start.'),
  max_results: z.number().int().min(1).max(50).optional(),
});
const createEventArgs = z.object({
  title: z.string().min(1).max(300),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  description: z.string().max(5000).optional(),
  attendees: z.array(z.string().email()).max(50).optional(),
});

const schemaOf = (s: z.ZodType) => {
  const { $schema: _s, ...json } = z.toJSONSchema(s) as Record<string, unknown>;
  return json;
};

export const DIRECT_TOOLS: DirectTool[] = [
  {
    name: 'gmail_search',
    connectorId: 'gmail',
    description: 'Search Gmail. Returns message ids with sender, subject, date and snippet.',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    schema: searchArgs,
    inputSchema: schemaOf(searchArgs),
    readOnly: true,
    run: async (token, a: z.infer<typeof searchArgs>) => {
      const list = await google(token, `${GMAIL}/messages?${new URLSearchParams({ q: a.query, maxResults: String(a.max_results ?? 10) })}`);
      const ids: string[] = (list.messages || []).map((m: any) => m.id);
      const messages = await Promise.all(
        ids.map(async (id) => {
          const m = await google(token, `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
          return { id, from: header(m, 'From'), subject: header(m, 'Subject'), date: header(m, 'Date'), snippet: m.snippet };
        })
      );
      return { messages };
    },
  },
  {
    name: 'gmail_read',
    connectorId: 'gmail',
    description: 'Read one Gmail message (headers and plain-text body).',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    schema: readArgs,
    inputSchema: schemaOf(readArgs),
    readOnly: true,
    run: async (token, a: z.infer<typeof readArgs>) => {
      const m = await google(token, `${GMAIL}/messages/${encodeURIComponent(a.message_id)}?format=full`);
      return { id: m.id, from: header(m, 'From'), to: header(m, 'To'), subject: header(m, 'Subject'), date: header(m, 'Date'), body: bodyText(m.payload).slice(0, 20_000) };
    },
  },
  {
    name: 'gmail_create_draft',
    connectorId: 'gmail',
    description: 'Create a Gmail draft (not sent). A person reviews and sends it.',
    scope: 'https://www.googleapis.com/auth/gmail.compose',
    schema: draftArgs,
    inputSchema: schemaOf(draftArgs),
    run: async (token, a: z.infer<typeof draftArgs>) => {
      const mime = [`To: ${a.to}`, `Subject: ${a.subject}`, 'Content-Type: text/plain; charset="UTF-8"', '', a.body].join('\r\n');
      const d = await google(token, `${GMAIL}/drafts`, { method: 'POST', body: JSON.stringify({ message: { raw: Buffer.from(mime).toString('base64url') } }) });
      return { draft_id: d.id, message_id: d.message?.id };
    },
  },
  {
    name: 'calendar_list_events',
    connectorId: 'calendar',
    description: 'List upcoming events on the primary calendar.',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    schema: listEventsArgs,
    inputSchema: schemaOf(listEventsArgs),
    readOnly: true,
    run: async (token, a: z.infer<typeof listEventsArgs>) => {
      const from = a.from ?? new Date().toISOString();
      const to = a.to ?? new Date(new Date(from).getTime() + 7 * 86_400_000).toISOString();
      const res = await google(token, `${CAL}/events?${new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: 'true', orderBy: 'startTime', maxResults: String(a.max_results ?? 20) })}`);
      return {
        events: (res.items || []).map((e: any) => ({
          id: e.id,
          title: e.summary,
          start: e.start?.dateTime ?? e.start?.date,
          end: e.end?.dateTime ?? e.end?.date,
          location: e.location ?? null,
          attendees: (e.attendees || []).map((x: any) => x.email),
        })),
      };
    },
  },
  {
    name: 'calendar_create_event',
    connectorId: 'calendar',
    description: 'Create an event on the primary calendar (invites attendees if given).',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    schema: createEventArgs,
    inputSchema: schemaOf(createEventArgs),
    run: async (token, a: z.infer<typeof createEventArgs>) => {
      const e = await google(token, `${CAL}/events?sendUpdates=all`, {
        method: 'POST',
        body: JSON.stringify({
          summary: a.title,
          description: a.description,
          start: { dateTime: a.start },
          end: { dateTime: a.end },
          attendees: a.attendees?.map((email) => ({ email })),
        }),
      });
      return { id: e.id, link: e.htmlLink };
    },
  },
];

export function directToolsFor(connectorId: string, grantedScopes: string[]): DirectTool[] {
  return DIRECT_TOOLS.filter((t) => t.connectorId === connectorId && grantedScopes.includes(t.scope));
}

export async function runDirectTool(name: string, token: string, args: unknown) {
  const tool = DIRECT_TOOLS.find((t) => t.name === name);
  if (!tool) throw new ServiceError(`Unknown tool ${name}.`, 'NOT_FOUND');
  return tool.run(token, tool.schema.parse(args ?? {}));
}
