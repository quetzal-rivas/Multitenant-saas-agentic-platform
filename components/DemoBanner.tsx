'use client';

import React from 'react';
import { isDemoMode } from '@/lib/demo';
import { AlertTriangle } from 'lucide-react';

export const DemoBanner: React.FC = () => {
  if (!isDemoMode()) return null;

  return (
    <div className="bg-amber-950/90 border-b border-amber-800/70 text-amber-200 px-4 py-1 text-xs font-mono flex items-center justify-between z-50">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        <span className="font-semibold">DEMO MODE ACTIVE</span>
        <span className="text-amber-300/80 hidden sm:inline">
          — Displaying simulated demo data. Real API key authentication & Supabase database queries are bypassed.
        </span>
      </div>
      <span className="text-[10px] uppercase bg-amber-900/60 text-amber-300 border border-amber-700/50 px-1.5 py-0.5 rounded">
        Playground
      </span>
    </div>
  );
};
