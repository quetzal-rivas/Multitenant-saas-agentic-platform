'use client';

import React from 'react';
import { Loader2, Mic, Square, Volume2 } from 'lucide-react';
import { useVoice, type Heard, type VoiceTarget } from './useVoice';

/**
 * Tap to talk: records until you pause, sends what you said as a voice turn through
 * `onHeard` (which returns the agent's reply), then reads the reply aloud. Tapping while
 * the agent speaks interrupts it.
 */
export const VoiceTalkButton: React.FC<{
  target: VoiceTarget;
  onHeard: (heard: Heard) => Promise<string | null>;
  speakReplies?: boolean;
  disabled?: boolean;
  onError?: (message: string) => void;
}> = ({ target, onHeard, speakReplies = true, disabled, onError }) => {
  const voice = useVoice(target);
  const { phase } = voice;

  const run = async () => {
    if (phase === 'listening') return voice.stopListening();
    if (phase === 'speaking') return voice.stopSpeaking();
    if (phase !== 'idle') return;
    try {
      const heard = await voice.listen();
      if (!heard?.text) {
        voice.setPhase('idle');
        return;
      }
      voice.setPhase('thinking');
      const reply = await onHeard(heard);
      voice.setPhase('idle');
      if (reply && speakReplies) await voice.speak(reply);
    } catch (err: any) {
      voice.setPhase('idle');
      onError?.(err?.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in the browser to talk.' : err?.message || 'Voice failed');
    }
  };

  const label =
    phase === 'listening' ? 'Listening… tap to stop' : phase === 'transcribing' ? 'Transcribing…' : phase === 'thinking' ? 'Thinking…' : phase === 'speaking' ? 'Speaking… tap to stop' : 'Talk';

  return (
    <button
      type="button"
      onClick={run}
      disabled={disabled || phase === 'transcribing' || phase === 'thinking'}
      title={label}
      aria-label={label}
      className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border disabled:opacity-60 ${
        phase === 'listening'
          ? 'bg-rose-600 border-rose-500 text-white'
          : phase === 'speaking'
            ? 'bg-violet-600 border-violet-500 text-white'
            : 'border-zinc-700 text-zinc-200 hover:border-emerald-500 hover:text-white'
      }`}
    >
      {phase === 'listening' && (
        <span className="absolute inset-0 rounded-lg ring-2 ring-rose-400 pointer-events-none" style={{ opacity: 0.3 + voice.level * 0.7 }} />
      )}
      {phase === 'transcribing' || phase === 'thinking' ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : phase === 'listening' ? (
        <Square className="w-4 h-4" />
      ) : phase === 'speaking' ? (
        <Volume2 className="w-4 h-4" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
};
