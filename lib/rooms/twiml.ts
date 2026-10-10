/** Minimal TwiML builder (XML-escaped). */

export function esc(value: string | number | boolean): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function attrs(a: Record<string, string | number | boolean | null | undefined>): string {
  return Object.entries(a)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => ` ${k}="${esc(v as string)}"`)
    .join('');
}

export const response = (...verbs: string[]) => `<?xml version="1.0" encoding="UTF-8"?><Response>${verbs.join('')}</Response>`;

/** Twilio <Say> voices per language (Polly neural where available). */
export function sayVoice(language: string): { voice: string; language: string } {
  const lang = language.toLowerCase();
  if (lang.startsWith('es')) return { voice: 'Polly.Mia-Neural', language: 'es-MX' };
  if (lang.startsWith('pt')) return { voice: 'Polly.Camila-Neural', language: 'pt-BR' };
  if (lang.startsWith('fr')) return { voice: 'Polly.Lea-Neural', language: 'fr-FR' };
  return { voice: 'Polly.Joanna-Neural', language: 'en-US' };
}

export function say(text: string, language: string): string {
  const v = sayVoice(language);
  return `<Say${attrs({ voice: v.voice, language: v.language })}>${esc(text)}</Say>`;
}

/** Twilio speech-recognition language for <Gather> and real-time transcription. */
export function speechLanguage(language: string): string {
  const lang = language.toLowerCase();
  if (lang === 'multi') return 'multi';
  if (lang.startsWith('es')) return 'es-MX';
  if (lang.startsWith('pt')) return 'pt-BR';
  if (lang.startsWith('fr')) return 'fr-FR';
  return lang.includes('-') ? language : 'en-US';
}
