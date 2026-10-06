/**
 * Turn an agent's (often markdown) reply into text that sounds right out loud, and split
 * it into sentence-sized chunks so playback can start before the whole reply is spoken.
 * Browser-safe.
 */

export function toSpeakable(text: string): string {
  return (
    text
      // Code blocks are not read out.
      .replace(/```[\s\S]*?```/g, ' (code omitted) ')
      .replace(/`([^`]+)`/g, '$1')
      // Links: keep the label, drop the address; bare URLs are dropped.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      // Markdown structure.
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*(\d+)\.\s+/gm, '$1. ')
      .replace(/\|/g, ', ')
      .replace(/^[\s,:-]+$/gm, '')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/([.!?])\s*\.(\s|$)/g, '$1$2')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/** Split into chunks of whole sentences, each at most `max` characters. */
export function splitSentences(text: string, max = 280): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [];
  const chunks: string[] = [];
  let current = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > max) {
      if (current) chunks.push(current), (current = '');
      for (let i = 0; i < s.length; i += max) chunks.push(s.slice(i, i + max).trim());
      continue;
    }
    // Keep the first chunk short so audio starts quickly.
    const limit = chunks.length === 0 ? Math.min(max, 140) : max;
    if (current && current.length + 1 + s.length > limit) {
      chunks.push(current);
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
