'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneOff,
  Headphones,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Signal,
  Copy,
  Check,
  Sparkles,
  Activity,
  Bot,
  User,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { LiveVoiceCall } from '@/Backend/twilio-conference-manager';

interface LiveVoiceConferenceSectionProps {
  onCallSelected?: (call: LiveVoiceCall) => void;
}

export const LiveVoiceConferenceSection: React.FC<LiveVoiceConferenceSectionProps> = ({
  onCallSelected,
}) => {
  const [calls, setCalls] = useState<LiveVoiceCall[]>([]);
  const [fadingCallIds, setFadingCallIds] = useState<Set<string>>(new Set());
  const [activeListeningId, setActiveListeningId] = useState<string | null>(null);
  const [audioVolume, setAudioVolume] = useState<number>(0.75);
  const [isMutedMonitor, setIsMutedMonitor] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [expandedTranscriptCallId, setExpandedTranscriptCallId] = useState<string | null>(null);

  // Web Audio Synth for live conference monitor stream
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const oscNodeRef = useRef<OscillatorNode | null>(null);
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const stopMonitoringAudio = () => {
    try {
      if (oscNodeRef.current) {
        oscNodeRef.current.stop();
        oscNodeRef.current.disconnect();
        oscNodeRef.current = null;
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect();
        gainNodeRef.current = null;
      }
    } catch {
      // Ignore cleanup error
    }
  };

  // Trigger graceful fade out
  const triggerFadeOut = (callId: string) => {
    setFadingCallIds((prev) => new Set(prev).add(callId));
    if (activeListeningId === callId) {
      stopMonitoringAudio();
      setActiveListeningId(null);
    }
    setTimeout(() => {
      setCalls((prev) => prev.filter((c) => c.id !== callId));
      setFadingCallIds((prev) => {
        const next = new Set(prev);
        next.delete(callId);
        return next;
      });
    }, 850);
  };

  // Initial load and periodic polling
  useEffect(() => {
    let isMounted = true;

    const loadLiveCalls = async () => {
      try {
        const res = await fetch('/api/twilio/live-calls?filter=active');
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.calls)) {
          setCalls(data.calls);
        }
      } catch (err) {
        console.error('Failed to sync live calls:', err);
      }
    };

    loadLiveCalls();
    const interval = setInterval(loadLiveCalls, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Duration ticking timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCalls((prev) =>
        prev.map((c) => {
          if (c.status === 'in-progress' && !fadingCallIds.has(c.id)) {
            return { ...c, durationSeconds: c.durationSeconds + 1 };
          }
          return c;
        })
      );
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fadingCallIds]);

  // Audio Monitor Stream synthesiser
  const startMonitoringAudio = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Create realistic soft telecom frequency bandpass filter (telephony audio 300Hz-3400Hz)
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1000, ctx.currentTime);
      filter.Q.setValueAtTime(1.2, ctx.currentTime);
      filterNodeRef.current = filter;

      // Master Gain
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(isMutedMonitor ? 0 : audioVolume * 0.08, ctx.currentTime);
      gainNodeRef.current = gain;

      // Dual subtle tone generator simulating carrier / ambient speech channel presence
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, ctx.currentTime);
      oscNodeRef.current = osc;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
    } catch (e) {
      console.warn('Web Audio monitor initialization notice:', e);
    }
  };

  // Adjust volume
  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(
        isMutedMonitor ? 0 : audioVolume * 0.08,
        audioCtxRef.current.currentTime
      );
    }
  }, [audioVolume, isMutedMonitor]);

  // Handle Listen Live
  const handleToggleListen = async (callId: string) => {
    if (activeListeningId === callId) {
      // Stop listening
      stopMonitoringAudio();
      setActiveListeningId(null);
      await fetch('/api/twilio/live-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listen', callId, listening: false }),
      });
    } else {
      // Start listening muted
      stopMonitoringAudio();
      startMonitoringAudio();
      setActiveListeningId(callId);
      await fetch('/api/twilio/live-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listen', callId, listening: true }),
      });
    }
  };

  // End call
  const handleEndCall = async (callId: string) => {
    try {
      // Trigger fade immediately
      triggerFadeOut(callId);

      await fetch('/api/twilio/live-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'end_call',
          callId,
          reason: 'Supervisor Console Hangup',
        }),
      });
    } catch (err) {
      console.error('Failed to end call:', err);
    }
  };

  // Simulate Inbound/Outbound call
  const handleSimulate = async (direction: 'inbound' | 'outbound') => {
    setIsSimulating(true);
    try {
      const res = await fetch('/api/twilio/live-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: direction === 'inbound' ? 'simulate_inbound' : 'simulate_outbound',
        }),
      });
      const data = await res.json();
      if (data.success && data.call) {
        setCalls((prev) => [data.call, ...prev.filter((c) => c.id !== data.call.id)]);
      }
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainingSec = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="shrink-0 border-b border-zinc-800/80 bg-[#080b11] transition-all duration-500">
      {/* Voice Calls Control Sub-Header */}
      <div className="px-6 py-2 bg-[#0b0e17] border-b border-zinc-800/60 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="font-semibold text-zinc-200 uppercase tracking-wider text-[11px]">
              Twilio Conference & ElevenLabs Voice Live Gateway
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-[10px] text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Supabase Realtime Synced</span>
          </div>

          {calls.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-950/80 text-red-300 border border-red-800/80 font-mono text-[10px] font-bold animate-pulse">
              {calls.length} ACTIVE {calls.length === 1 ? 'CALL' : 'CALLS'}
            </span>
          )}
        </div>

        {/* Quick Simulation Trigger Controls */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 hidden sm:inline">Simulate Live Twilio Call:</span>
          <button
            onClick={() => handleSimulate('inbound')}
            disabled={isSimulating}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-800/60 rounded transition-colors disabled:opacity-50"
            title="Simulate outside customer calling Twilio Phone Number"
          >
            <PhoneIncoming className="w-3 h-3 text-emerald-400" />
            <span>Inbound Call</span>
          </button>

          <button
            onClick={() => handleSimulate('outbound')}
            disabled={isSimulating}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-cyan-950/80 hover:bg-cyan-900/90 text-cyan-300 border border-cyan-800/60 rounded transition-colors disabled:opacity-50"
            title="Simulate Voice Agent dialing external lead via Twilio DID"
          >
            <PhoneOutgoing className="w-3 h-3 text-cyan-400" />
            <span>Outbound Call</span>
          </button>
        </div>
      </div>

      {/* Dynamic Live Call Banners Container */}
      <div className="p-3 space-y-2.5">
        {calls.length === 0 ? (
          <div className="py-2.5 px-4 rounded-lg bg-zinc-900/40 border border-zinc-800/50 flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500/50" />
              <span>No active voice calls at this moment. Incoming and outgoing calls will appear here in real time.</span>
            </div>
            <div className="text-[11px] text-zinc-500">
              Twilio DID: <span className="font-mono text-zinc-400">+1 (800) 555-0199</span> (TwiML Conference Muted Monitor Ready)
            </div>
          </div>
        ) : (
          calls.map((call) => {
            const isFading = fadingCallIds.has(call.id);
            const isListening = activeListeningId === call.id;
            const isExpanded = expandedTranscriptCallId === call.id;
            const lastTranscript = call.transcripts[call.transcripts.length - 1];

            return (
              <div
                key={call.id}
                className={`rounded-xl border transition-all duration-700 ease-out overflow-hidden shadow-lg ${
                  isFading
                    ? 'opacity-0 -translate-y-3 max-h-0 py-0 my-0 border-transparent pointer-events-none'
                    : isListening
                    ? 'bg-gradient-to-r from-[#0d161d] via-[#09131a] to-[#0d121c] border-cyan-500/50 shadow-cyan-950/30'
                    : call.direction === 'inbound'
                    ? 'bg-gradient-to-r from-[#0b1411] via-[#09110e] to-[#0c1417] border-emerald-500/40 shadow-emerald-950/20'
                    : 'bg-gradient-to-r from-[#0c121b] via-[#0a1018] to-[#0e141a] border-cyan-500/40 shadow-cyan-950/20'
                }`}
              >
                {/* Banner Top Strip */}
                <div className="px-4 py-2.5 bg-black/30 border-b border-zinc-800/60 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Direction Badge */}
                    {call.direction === 'inbound' ? (
                      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold tracking-wide uppercase">
                        <PhoneIncoming className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
                        <span>Incoming Voice Call</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[11px] font-semibold tracking-wide uppercase">
                        <PhoneOutgoing className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
                        <span>Outgoing Voice Call</span>
                      </span>
                    )}

                    {/* Live Indicator */}
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800/80 text-[10px] font-mono font-medium">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
                      <span>LIVE CONFERENCE</span>
                    </span>

                    {/* Twilio Room ID with Copy */}
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900/90 border border-zinc-700/80 text-xs">
                      <span className="text-zinc-500 text-[10px]">Room Twilio ID:</span>
                      <code className="font-mono text-amber-300 text-[11px] font-semibold">
                        {call.roomTwilioId}
                      </code>
                      <button
                        onClick={() => handleCopy(call.roomTwilioId, `room_${call.id}`)}
                        className="text-zinc-400 hover:text-zinc-200 transition-colors ml-0.5"
                        title="Copy Twilio Conference Room ID"
                      >
                        {copiedId === `room_${call.id}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    {/* Duration Counter */}
                    <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/60 border border-zinc-800 text-xs font-mono font-bold text-emerald-400">
                      <span className="text-[10px] text-zinc-500 font-sans">DURATION:</span>
                      <span>{formatSeconds(call.durationSeconds)}</span>
                    </div>
                  </div>

                  {/* Right Header Status Badges */}
                  <div className="flex items-center gap-2">
                    {isListening && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700 text-[10px] font-mono font-semibold animate-pulse">
                        <Headphones className="w-3 h-3 text-cyan-400" />
                        <span>SUPERVISOR LISTENING (MUTED)</span>
                      </span>
                    )}

                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-800">
                      SID: {call.conferenceSid.slice(0, 10)}...
                    </span>
                  </div>
                </div>

                {/* Banner Main Content Body */}
                <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                  {/* Left Column: Caller & Agent Info (5 Cols) */}
                  <div className="lg:col-span-5 space-y-2.5">
                    {/* Participant Details */}
                    <div className="flex items-start justify-between gap-3 bg-black/40 p-3 rounded-lg border border-zinc-800/70">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-0.5">
                          <User className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Caller:</span>
                          <strong className="text-zinc-100 font-medium">{call.callerName}</strong>
                          {call.callerCompany && (
                            <span className="text-[10px] text-zinc-400">({call.callerCompany})</span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-emerald-300 font-medium">
                          {call.direction === 'inbound' ? call.fromPhone : call.toPhone}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1.5 text-xs text-zinc-400 mb-0.5">
                          <Bot className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Agent:</span>
                          <strong className="text-zinc-100 font-medium">{call.elevenLabsAgentName}</strong>
                        </div>
                        <div className="text-[11px] font-mono text-zinc-400">
                          {call.elevenLabsVoiceName}
                        </div>
                      </div>
                    </div>

                    {/* Real-time Telemetry Pills */}
                    <div className="flex flex-wrap items-center gap-2 text-[10px]">
                      <span className="px-2 py-0.5 rounded bg-zinc-900/80 border border-zinc-800 text-zinc-400 font-mono">
                        Codec: {call.audioCodec}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-zinc-900/80 border border-zinc-800 text-zinc-400 font-mono">
                        Turn Latency: ~{call.turnTakingLatencyMs}ms
                      </span>
                      <span className="px-2 py-0.5 rounded bg-zinc-900/80 border border-zinc-800 text-zinc-400 font-mono">
                        Twilio: {call.twilioRegion}
                      </span>
                    </div>
                  </div>

                  {/* Middle Column: Live Dialogue Snippet & Dynamic Waveform (4 Cols) */}
                  <div className="lg:col-span-4 bg-black/40 p-3 rounded-lg border border-zinc-800/70 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                        Live Voice Dialogue
                      </span>
                      <button
                        onClick={() =>
                          setExpandedTranscriptCallId(isExpanded ? null : call.id)
                        }
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
                      >
                        {isExpanded ? (
                          <>
                            <span>Hide Log</span>
                            <ChevronUp className="w-3 h-3" />
                          </>
                        ) : (
                          <>
                            <span>Full Log ({call.transcripts.length})</span>
                            <ChevronDown className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    </div>

                    {/* Animated Audio Equalizer Bars */}
                    <div className="flex items-center gap-1 h-3.5 py-0.5">
                      {[40, 75, 90, 55, 80, 100, 65, 85, 45, 95, 70, 50, 85, 60, 40].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-gradient-to-t from-emerald-600 to-cyan-400 rounded-full animate-pulse"
                          style={{
                            height: `${Math.max(20, (h + (i % 3) * 15) % 100)}%`,
                            animationDuration: `${0.4 + (i % 4) * 0.2}s`,
                          }}
                        />
                      ))}
                    </div>

                    {/* Latest snippet */}
                    {lastTranscript && (
                      <div className="text-xs text-zinc-300 line-clamp-2 italic bg-zinc-900/60 p-2 rounded border border-zinc-800/60">
                        <strong className="text-emerald-400 not-italic uppercase text-[10px] mr-1.5 font-mono">
                          {lastTranscript.speaker === 'agent' ? 'ElevenLabs' : 'Caller'}:
                        </strong>
                        &ldquo;{lastTranscript.text}&rdquo;
                      </div>
                    )}
                  </div>

                  {/* Right Column: Actions (Listen Live Muted / End Call) (3 Cols) */}
                  <div className="lg:col-span-3 flex flex-col gap-2">
                    {/* Listen Live Call Muted Button */}
                    <button
                      onClick={() => handleToggleListen(call.id)}
                      className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all shadow-md ${
                        isListening
                          ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-cyan-900/40 ring-2 ring-cyan-400/50'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-900/30'
                      }`}
                    >
                      <Headphones className="w-4 h-4" />
                      <span>{isListening ? 'Stop Listening' : 'Listen Live Call'}</span>
                      <span className="flex items-center gap-0.5 text-[9px] bg-black/20 text-black font-mono px-1.5 py-0.5 rounded font-bold">
                        <MicOff className="w-2.5 h-2.5" />
                        MUTED
                      </span>
                    </button>

                    {/* End Call / Hang Up Button */}
                    <button
                      onClick={() => handleEndCall(call.id)}
                      className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium text-red-300 bg-red-950/60 hover:bg-red-900/80 border border-red-800/80 transition-colors"
                      title="Terminate Twilio Conference & release call leg"
                    >
                      <PhoneOff className="w-3.5 h-3.5 text-red-400" />
                      <span>End Call (Twilio Hangup)</span>
                    </button>

                    <div className="text-[10px] text-zinc-500 text-center flex items-center justify-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-500" />
                      <span>Silent QA monitoring | 0 audio bleed</span>
                    </div>
                  </div>
                </div>

                {/* Supervisor Audio Listening Strip (When Active) */}
                {isListening && (
                  <div className="px-4 py-2.5 bg-cyan-950/30 border-t border-cyan-800/40 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      <span className="font-semibold text-cyan-200">
                        Monitoring Live Twilio Conference Stream:
                      </span>
                      <span className="text-cyan-400 font-mono text-[11px]">
                        room: {call.roomTwilioId}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-300 text-[10px] border border-cyan-700/60">
                        Microphone: Locked Off (Muted)
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIsMutedMonitor(!isMutedMonitor)}
                          className="text-zinc-400 hover:text-zinc-200"
                        >
                          {isMutedMonitor ? (
                            <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                          )}
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={isMutedMonitor ? 0 : audioVolume}
                          onChange={(e) => {
                            setAudioVolume(parseFloat(e.target.value));
                            if (isMutedMonitor) setIsMutedMonitor(false);
                          }}
                          className="w-20 accent-cyan-400 cursor-pointer"
                        />
                        <span className="font-mono text-[10px] text-zinc-400 w-8">
                          {isMutedMonitor ? '0%' : `${Math.round(audioVolume * 100)}%`}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Expanded Full Dialogue Transcript Drawer */}
                {isExpanded && (
                  <div className="px-4 py-3 bg-black/60 border-t border-zinc-800/80 space-y-2">
                    <div className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between">
                      <span>Full Speech Dialogue History:</span>
                      <span className="text-[10px] text-zinc-500">
                        Updated via Twilio Conference & ElevenLabs Webhook
                      </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-2 pr-2 text-xs">
                      {call.transcripts.map((t) => (
                        <div
                          key={t.id}
                          className={`p-2 rounded-lg border text-xs ${
                            t.speaker === 'agent'
                              ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-200 ml-6'
                              : t.speaker === 'caller'
                              ? 'bg-zinc-900/80 border-zinc-800 text-zinc-200 mr-6'
                              : 'bg-zinc-950 border-zinc-900 text-zinc-400 text-center text-[11px]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                            <span className="font-mono uppercase font-semibold">
                              {t.speaker === 'agent'
                                ? 'ElevenLabs Voice Agent'
                                : t.speaker === 'caller'
                                ? call.callerName
                                : 'Conference System'}
                            </span>
                            <span>{new Date(t.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div>{t.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
