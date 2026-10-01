'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bot, Github, Mail, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = createClient();

  const handleOAuthLogin = async (provider: 'github' | 'google') => {
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?provider=${provider}&next=/onboarding`,
        },
      });
      if (error) {
        setMessage(`OAuth Sign-In Error: ${error.message}`);
      }
    } catch (err: any) {
      setMessage(`Authentication Exception: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setMessage(null);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding`,
          },
        });
        if (error) throw error;
        setMessage('✅ Account created! You can now log in.');
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // Successful login, router should redirect or user clicks "Go to Dashboard"
        router.push('/dashboard');
      }
    } catch (err: any) {
      setMessage(`Auth Error: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 font-sans flex flex-col justify-center items-center px-4 selection:bg-emerald-900 selection:text-emerald-200">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/15 via-zinc-950/0 to-transparent pointer-events-none" />

      {/* Brand Header */}
      <div className="mb-8 text-center relative z-10">
        <Link href="/" className="inline-flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1px] shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-[#090b10] rounded-[11px] flex items-center justify-center">
              <Bot className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform" />
            </div>
          </div>
          <span className="font-bold text-2xl tracking-tight text-white">Context Control</span>
        </Link>
        <p className="text-zinc-400 text-sm mt-2">Sign in to manage your multi-tenant agent teams</p>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-md p-8 rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-2xl backdrop-blur-md relative z-10">
        <h2 className="text-xl font-bold text-white mb-6 text-center">Authentication Gateway</h2>

        {message && (
          <div className="mb-6 p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs text-center font-mono">
            {message}
          </div>
        )}

        {/* OAuth Provider Buttons */}
        <div className="space-y-3 mb-6">
          <button
            onClick={() => handleOAuthLogin('github')}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700/80 text-white font-medium text-sm transition-all flex items-center justify-center gap-3 border border-zinc-700/50 shadow-sm"
          >
            <Github className="w-5 h-5 text-white" />
            Continue with GitHub
          </button>

          <button
            onClick={() => handleOAuthLogin('google')}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700/80 text-white font-medium text-sm transition-all flex items-center justify-center gap-3 border border-zinc-700/50 shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.4 0 15.3c0 2.9.7 5.6 1.9 8l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
            Continue with Google
          </button>
        </div>

        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800"></div>
          </div>
          <span className="relative px-3 bg-[#090b10] text-xs text-zinc-500 uppercase tracking-wider font-mono">
            or email & password
          </span>
        </div>

        {/* Email Auth Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Work Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
          >
            {isSignUp ? 'Create Account' : 'Sign In'} <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
          </button>
        </div>


      </div>

      <p className="mt-8 text-xs text-zinc-500 text-center flex items-center gap-1.5">
        <ShieldCheck className="w-4 h-4 text-emerald-500" /> Protected by Supabase Auth & PostgreSQL Row-Level Security
      </p>
    </div>
  );
}
