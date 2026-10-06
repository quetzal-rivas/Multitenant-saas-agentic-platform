'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { splitSentences, toSpeakable } from '@/lib/voice/spoken';

/**
 * Browser side of the voice pipeline:
 *   listen()  records the mic (stops after a pause, on tap, or at 60 s) and transcribes it
 *             on the server; when the server says "use the browser", the browser's own
 *             recognition, which ran alongside the recording, supplies the text.
 *   speak()   reads a reply aloud sentence by sentence (the next sentence is fetched while
 *             the current one plays); falls back to the browser's speech synthesis.
 */

export type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

export interface VoiceTarget {
  session_id?: string;
  profile_id?: string;
  /** Unsaved profile being tested on the Voice page. */
  profile?: Record<string, unknown>;
}

export interface Heard {
  text: string;
  provider: string;
  durationSec: number;
  latencyMs: number;
}

const MAX_SECONDS = 60;
const SILENCE_MS = 1500;
const SPEECH_LEVEL = 0.035;

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';
}

function browserRecognition(language: string): { result: () => string; stop: () => void } | null {
  const Ctor = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  if (!Ctor) return null;
  try {
    const rec = new Ctor();
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = false;
    let text = '';
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += `${e.results[i][0].transcript} `;
    };
    rec.onerror = () => undefined;
    rec.start();
    return {
      result: () => text.trim(),
      stop: () => {
        try {
          rec.stop();
        } catch {
          /* already stopped */
        }
      },
    };
  } catch {
    return null;
  }
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return body?.error || `Request failed (${res.status})`;
}

export function useVoice(target: VoiceTarget, opts: { language?: string } = {}) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);
  const stopRecording = useRef<(() => void) | null>(null);
  const playback = useRef<{ cancelled: boolean; audio: HTMLAudioElement | null } | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;
  const language = opts.language || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

  const stopSpeaking = useCallback(() => {
    if (playback.current) {
      playback.current.cancelled = true;
      playback.current.audio?.pause();
    }
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    playback.current = null;
  }, []);

  useEffect(() => () => {
    stopRecording.current?.();
    stopSpeaking();
  }, [stopSpeaking]);

  /** Record one utterance and transcribe it. Resolves null when nothing was said. */
  const listen = useCallback(async (): Promise<Heard | null> => {
    setError(null);
    stopSpeaking();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot record audio.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = pickMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const recognition = browserRecognition(language);

    // Level meter + stop after a pause once speech was heard.
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const started = Date.now();
    let heardSpeech = false;
    let lastLoud = Date.now();

    setPhase('listening');
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    let timer: ReturnType<typeof setInterval> | null = null;
    const finish = () => {
      if (timer) clearInterval(timer);
      timer = null;
      if (recorder.state !== 'inactive') recorder.stop();
    };
    stopRecording.current = finish;
    recorder.start(250);
    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      const rms = Math.sqrt(sum / samples.length);
      setLevel(Math.min(1, rms * 8));
      const now = Date.now();
      if (rms > SPEECH_LEVEL) {
        heardSpeech = true;
        lastLoud = now;
      }
      if ((heardSpeech && now - lastLoud > SILENCE_MS) || now - started > MAX_SECONDS * 1000) finish();
      // Nothing said for 8 s: give up.
      if (!heardSpeech && now - started > 8000) finish();
    }, 100);

    await stopped;
    stopRecording.current = null;
    stream.getTracks().forEach((t) => t.stop());
    void audioCtx.close();
    setLevel(0);
    // Give the browser recognizer a moment to deliver its final result.
    await new Promise((r) => setTimeout(r, recognition ? 400 : 0));
    recognition?.stop();
    const durationSec = Math.min(MAX_SECONDS, (Date.now() - started) / 1000);
    if (!heardSpeech) {
      setPhase('idle');
      return null;
    }

    setPhase('transcribing');
    const form = new FormData();
    const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
    form.append('audio', blob, 'speech');
    form.append('duration', String(Math.round(durationSec)));
    const t = targetRef.current;
    if (t.session_id) form.append('session_id', t.session_id);
    if (t.profile_id) form.append('profile_id', t.profile_id);
    if (t.profile) form.append('profile', JSON.stringify(t.profile));
    const res = await fetch('/api/v1/voice/transcribe', { method: 'POST', body: form });
    if (!res.ok) {
      setPhase('idle');
      throw new Error(await readError(res));
    }
    const body = await res.json();
    if (body.fallback === 'browser') {
      const text = recognition?.result() || '';
      if (!text) {
        setPhase('idle');
        throw new Error(
          recognition
            ? "The browser's speech recognition didn't catch that. Try again, or add a Gemini key for better recognition."
            : 'No speech-to-text provider is available and this browser has no built-in recognition. Add a Gemini key or use Chrome.'
        );
      }
      return { text, provider: 'browser', durationSec, latencyMs: body.latency_ms ?? 0 };
    }
    return { text: String(body.text || '').trim(), provider: body.provider, durationSec, latencyMs: body.latency_ms ?? 0 };
  }, [language, stopSpeaking]);

  /** Stop recording now (the tap that ends "listening"). */
  const stopListening = useCallback(() => stopRecording.current?.(), []);

  const speakWithBrowser = (text: string, state: { cancelled: boolean }) =>
    new Promise<void>((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth || state.cancelled) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = language;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    });

  /** Read a reply aloud. Resolves when finished or interrupted. */
  const speak = useCallback(async (reply: string): Promise<string | null> => {
    stopSpeaking();
    const chunks = splitSentences(toSpeakable(reply));
    if (!chunks.length) return null;
    const state = { cancelled: false, audio: null as HTMLAudioElement | null };
    playback.current = state;
    setPhase('speaking');
    let usedBrowser = false;
    let provider: string | null = null;

    const fetchChunk = (text: string) =>
      fetch('/api/v1/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ...targetRef.current }),
      });

    try {
      let pending: Promise<Response> | null = fetchChunk(chunks[0]);
      for (let i = 0; i < chunks.length && !state.cancelled; i++) {
        if (usedBrowser) {
          await speakWithBrowser(chunks[i], state);
          continue;
        }
        const res: Response = await pending!;
        pending = i + 1 < chunks.length ? fetchChunk(chunks[i + 1]) : null;
        if (!res.ok) throw new Error(await readError(res));
        if ((res.headers.get('content-type') || '').includes('application/json')) {
          // The server has no provider available right now: the browser speaks the rest.
          usedBrowser = true;
          provider = 'browser';
          pending = null;
          await speakWithBrowser(chunks[i], state);
          continue;
        }
        provider = res.headers.get('X-Voice-Provider') || provider;
        setLastSpeaker(provider);
        const url = URL.createObjectURL(await res.blob());
        if (state.cancelled) break;
        const audio = new Audio(url);
        state.audio = audio;
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          audio.onpause = () => state.cancelled && resolve();
          audio.play().catch(() => resolve());
        });
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not play the reply');
    } finally {
      if (playback.current === state) playback.current = null;
      setPhase((p) => (p === 'speaking' ? 'idle' : p));
    }
    if (provider) setLastSpeaker(provider);
    return provider;
  }, [stopSpeaking]);

  return { phase, setPhase, level, error, setError, lastSpeaker, listen, stopListening, speak, stopSpeaking };
}
