'use client';

import React, { useEffect, useState } from 'react';
import { PhoneCall } from 'lucide-react';

/** App-wide banner while calls are live (polls every 10 s; hidden when none). */
export const LiveCallBanner: React.FC<{ onOpen: () => void; hidden?: boolean }> = ({ onOpen, hidden }) => {
  const [live, setLive] = useState<Array<{ id: string; customer_number: string | null; voice_agent_name?: string | null; status: string }>>([]);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch('/api/v1/rooms?live=1', { cache: 'no-store' });
        if (res.status === 401 || res.status === 403) {
          stop = true;
          return;
        }
        if (res.ok) setLive((await res.json()).rooms || []);
      } catch {
        /* offline: try again later */
      }
    };
    load();
    const t = setInterval(() => !stop && load(), 10_000);
    return () => clearInterval(t);
  }, []);
  if (hidden || live.length === 0) return null;
  const first = live[0];
  return (
    <button onClick={onOpen} className="w-full flex items-center justify-center gap-2 px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold">
      <PhoneCall className="w-3.5 h-3.5 animate-pulse" />
      {live.length === 1 ? `Live call: ${first.customer_number ?? 'caller'}${first.voice_agent_name ? ` with ${first.voice_agent_name}` : ''}` : `${live.length} live calls`} · open
    </button>
  );
};
