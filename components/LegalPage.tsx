import React from 'react';
import Link from 'next/link';
import { LEGAL } from '@/lib/legal/entity';

/** Shared layout for the privacy notice and the terms. */
export const LegalPage: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="min-h-screen bg-[#07090e] text-zinc-300 font-sans">
    <header className="border-b border-zinc-800/80">
      <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-white font-semibold">Context Control</Link>
        <nav className="flex gap-4 text-sm text-zinc-400">
          <Link href="/privacy" className="hover:text-white">Privacidad</Link>
          <Link href="/terms" className="hover:text-white">Términos</Link>
        </nav>
      </div>
    </header>
    <main className="max-w-3xl mx-auto px-6 py-10">
      {!LEGAL.reviewed && (
        <div className="mb-8 p-3 rounded-lg border border-amber-800/60 bg-amber-950/30 text-amber-200 text-sm">
          Borrador pendiente de revisión legal. Puede cambiar antes de su publicación definitiva.
        </div>
      )}
      <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
      <p className="text-sm text-zinc-500 mb-10">Última actualización: {LEGAL.updatedAt}</p>
      <div className="space-y-6 leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_a]:text-emerald-400 [&_a]:underline">
        {children}
      </div>
    </main>
    <footer className="py-8 border-t border-zinc-800/80 text-center text-xs text-zinc-500">© 2026 Context Control</footer>
  </div>
);
