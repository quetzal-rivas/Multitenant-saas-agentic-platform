'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

/** Reached from the password-reset email (the callback has signed the user in). */
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setReady(!!data.user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setMessage('Use at least 8 characters.');
    if (password !== confirm) return setMessage('The passwords do not match.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMessage(error.message);
    router.push('/dashboard');
  };

  const field = 'w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm focus:outline-none focus:border-emerald-500';

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-5">
        <h1 className="text-xl font-bold text-white text-center">Set a new password</h1>
        {ready === null && <p className="text-sm text-zinc-500 text-center">Checking your link…</p>}
        {ready === false && (
          <p className="text-sm text-zinc-400 text-center">
            This link has expired or was already used. <Link href="/login" className="text-emerald-400 hover:text-emerald-300">Request a new one</Link>.
          </p>
        )}
        {ready && (
          <form onSubmit={submit} className="space-y-4">
            <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className={field} />
            <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" className={field} />
            <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm">
              {busy ? 'Saving…' : 'Save and continue'}
            </button>
          </form>
        )}
        {message && <p className="text-sm text-rose-400 text-center">{message}</p>}
      </div>
    </div>
  );
}
