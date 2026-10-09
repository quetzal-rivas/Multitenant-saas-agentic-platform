/**
 * Starter code for an Inbound Gateway router function (AI Function Studio). Browser-safe.
 * The gateway calls main(input) with { event, raw, endpoint } and expects a decision:
 *   { action: "route", team_id?, conversation_key?, message?, reply?, reason? }
 *   { action: "ignore", reason? }
 * Omitted fields fall back to the endpoint's defaults (default team, the event's
 * conversation key, a standard message, reply on).
 */

export const ROUTER_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    event: { type: 'object', description: 'Normalized event: channel, conversation_key, sender {id, name}, text, attachments, meta' },
    raw: { description: 'The provider payload as received' },
    endpoint: { type: 'object', description: '{ id, name, preset }' },
  },
  required: ['event'],
};

export const ROUTER_TEMPLATES = {
  python: `# Webhook router for the Inbound Gateway.
# input = {"event": {...normalized...}, "raw": {...provider payload...}, "endpoint": {...}}
# Return {"action": "route", ...} or {"action": "ignore", "reason": "..."}.

SALES_TEAM = ""    # paste a team id from Team Builder (or leave empty for the endpoint default)
SUPPORT_TEAM = ""

def main(input: dict) -> dict:
    event = input.get("event", {})
    text = (event.get("text") or "").lower()

    if not text.strip():
        return {"action": "ignore", "reason": "empty message"}

    if any(word in text for word in ("price", "quote", "buy", "precio", "cotización")):
        decision = {"action": "route", "reason": "sales keywords"}
        if SALES_TEAM:
            decision["team_id"] = SALES_TEAM
        return decision

    decision = {"action": "route", "reason": "default to support"}
    if SUPPORT_TEAM:
        decision["team_id"] = SUPPORT_TEAM
    return decision
`,
  typescript: `// Webhook router for the Inbound Gateway.
// input = { event: {...normalized...}, raw: {...provider payload...}, endpoint: {...} }
// Return { action: 'route', ... } or { action: 'ignore', reason }.

const SALES_TEAM = '';   // paste a team id from Team Builder (or leave empty for the endpoint default)
const SUPPORT_TEAM = '';

export default async function main(input: { event: any; raw?: any; endpoint?: any }) {
  const text = String(input.event?.text ?? '').toLowerCase();
  if (!text.trim()) return { action: 'ignore', reason: 'empty message' };

  if (['price', 'quote', 'buy', 'precio', 'cotización'].some((w) => text.includes(w))) {
    return { action: 'route', reason: 'sales keywords', ...(SALES_TEAM ? { team_id: SALES_TEAM } : {}) };
  }
  return { action: 'route', reason: 'default to support', ...(SUPPORT_TEAM ? { team_id: SUPPORT_TEAM } : {}) };
}
`,
} as const;
