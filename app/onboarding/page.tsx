'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bot, Building2, Key, Phone, ArrowRight, CheckCircle2, ShieldAlert, Sparkles, Layers } from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);
  const [orgName, setOrgName] = useState<string>('QuantumLeads LLC');
  const [apiKeys, setApiKeys] = useState<{ name: string; value: string }[]>([
    { name: 'OPENAI_API_KEY', value: '' },
    { name: 'ANTHROPIC_API_KEY', value: '' },
    { name: 'ELEVENLABS_API_KEY', value: '' },
    { name: 'GEMINI_API_TOKEN', value: '' }
  ]);
  const [selectedTwilioNumber, setSelectedTwilioNumber] = useState<string>('+1 (555) 839-2041');
  const [showCustomPorting, setShowCustomPorting] = useState<boolean>(false);
  const [customTwilioNumber, setCustomTwilioNumber] = useState<string>('');
  const [customTwilioSid, setCustomTwilioSid] = useState<string>('');
  const [customTwilioToken, setCustomTwilioToken] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const AVAILABLE_TWILIO_NUMBERS = [
    { number: '+1 (555) 839-2041', label: 'Primary Enterprise Voice Line (US East)' },
    { number: '+1 (555) 912-3344', label: 'DevOps Incident Pager Line (US West)' },
    { number: '+1 (555) 438-9021', label: 'Executive Concierge Line (US Central)' },
    { number: '+44 20 7946 0912', label: 'International Ops Line (UK London)' },
  ];

  const handleCompleteOnboarding = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgName,
          apiKeys: apiKeys.filter(k => k.value.trim() !== ''),
          twilioNumber: showCustomPorting ? customTwilioNumber : selectedTwilioNumber,
          twilioSid: showCustomPorting ? customTwilioSid : undefined,
          twilioToken: showCustomPorting ? customTwilioToken : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Failed to complete onboarding setup');
      } else {
        // Save tenant session to localStorage and navigate to dashboard
        if (typeof window !== 'undefined') {
          localStorage.setItem('ctx_tenant_id', data.tenantId || '00000000-0000-0000-0000-000000000001');
          localStorage.setItem('ctx_onboarded', 'true');
        }
        router.push('/dashboard');
      }
    } catch (err: any) {
      // Fallback redirect to dashboard
      if (typeof window !== 'undefined') {
        localStorage.setItem('ctx_onboarded', 'true');
      }
      router.push('/dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 font-sans flex flex-col justify-center items-center px-4 py-12 selection:bg-emerald-900 selection:text-emerald-200">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/15 via-zinc-950/0 to-transparent pointer-events-none" />

      {/* Brand Header */}
      <div className="mb-8 text-center relative z-10">
        <Link href="/" className="inline-flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1px] shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-[#090b10] rounded-[11px] flex items-center justify-center">
              <Bot className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
          <span className="font-bold text-2xl tracking-tight text-white">Context Control</span>
        </Link>
        <p className="text-zinc-400 text-sm mt-2">First-Time Workspace Provisioning Wizard</p>
      </div>

      {/* Wizard Progress Stepper */}
      <div className="flex items-center gap-4 mb-8 relative z-10">
        <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border ${step === 1 ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}>
          <span>1</span> Organization
        </div>
        <div className="w-6 h-[1px] bg-zinc-800" />
        <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border ${step === 2 ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}>
          <span>2</span> BYOK Keys
        </div>
        <div className="w-6 h-[1px] bg-zinc-800" />
        <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border ${step === 3 ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}>
          <span>3</span> Telephony
        </div>
      </div>

      {/* Onboarding Wizard Card */}
      <div className="w-full max-w-xl p-8 rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-2xl backdrop-blur-md relative z-10">
        {errorMsg && (
          <div className="mb-6 p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* STEP 1: Organization Name */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs mb-2">
                <Building2 className="w-4 h-4" /> STEP 1 OF 3
              </div>
              <h2 className="text-2xl font-bold text-white">Create Your Organization</h2>
              <p className="text-zinc-400 text-sm mt-1">
                Name your tenant workspace. This provisions a dedicated Supabase PostgreSQL schema boundary with native RLS isolation.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-2">Organization / Company Name</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Acme Global Logistics"
                className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-medium"
              />
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!orgName.trim()}
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              Continue to BYOK Keys <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: Bring Your Own Key (BYOK) */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs mb-2">
                <Key className="w-4 h-4" /> STEP 2 OF 3
              </div>
              <h2 className="text-2xl font-bold text-white">Bring Your Own Key (BYOK)</h2>
              <p className="text-zinc-400 text-sm mt-1">
                Paste your secret API keys. Credentials are encrypted via AES-256 into your tenant vault and never exposed to client bundles.
              </p>
            </div>

            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {apiKeys.map((keyObj, index) => (
                <div key={index} className="flex items-end gap-3 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                  <div className="w-1/3">
                    <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Key Name</label>
                    <input
                      type="text"
                      value={keyObj.name}
                      onChange={(e) => {
                        const newKeys = [...apiKeys];
                        newKeys[index].name = e.target.value.toUpperCase().replace(/\s+/g, '_');
                        setApiKeys(newKeys);
                      }}
                      placeholder="API_KEY_NAME"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Secret Value</label>
                    <input
                      type="password"
                      value={keyObj.value}
                      onChange={(e) => {
                        const newKeys = [...apiKeys];
                        newKeys[index].value = e.target.value;
                        setApiKeys(newKeys);
                      }}
                      placeholder="sk-..."
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      const newKeys = [...apiKeys];
                      newKeys.splice(index, 1);
                      setApiKeys(newKeys);
                    }}
                    className="p-2 mb-0.5 rounded-lg text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setApiKeys([...apiKeys, { name: 'NEW_API_KEY', value: '' }])}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 mt-2 transition-colors"
            >
              + Add Custom API Key
            </button>

            <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-400 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>BYOK ensures you maintain full control over your LLM token budget and stay 100% compliant with free-tier limits.</span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="w-1/3 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="w-2/3 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                Continue to Telephony <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Telephony & Voice Provisioning */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs mb-2">
                <Phone className="w-4 h-4" /> STEP 3 OF 3
              </div>
              <h2 className="text-2xl font-bold text-white">Telephony & Voice Provisioning</h2>
              <p className="text-zinc-400 text-sm mt-1">
                Select an available system Twilio line to bind to your workspace for automated ElevenLabs voice call escalations.
              </p>
            </div>

            {!showCustomPorting ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-2">Available System Twilio Phone Lines</label>
                  <select
                    value={selectedTwilioNumber}
                    onChange={(e) => setSelectedTwilioNumber(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
                  >
                    {AVAILABLE_TWILIO_NUMBERS.map((item) => (
                      <option key={item.number} value={item.number}>
                        {item.number} — {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setShowCustomPorting(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 mt-2 transition-colors"
                >
                  + Port custom Number
                </button>
              </>
            ) : (
              <div className="space-y-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white">Custom Twilio Credentials</h3>
                  <button
                    onClick={() => setShowCustomPorting(false)}
                    className="text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    Use System Number
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={customTwilioNumber}
                    onChange={(e) => setCustomTwilioNumber(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Twilio Account SID</label>
                  <input
                    type="text"
                    value={customTwilioSid}
                    onChange={(e) => setCustomTwilioSid(e.target.value)}
                    placeholder="AC..."
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Twilio Auth Token</label>
                  <input
                    type="password"
                    value={customTwilioToken}
                    onChange={(e) => setCustomTwilioToken(e.target.value)}
                    placeholder="Secret token"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-1 font-mono">
              <div className="font-bold flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Workspace Provisioning Ready:</div>
              <div>• Tenant: {orgName}</div>
              <div>• Telephony: {showCustomPorting ? (customTwilioNumber || 'Pending Configuration') : selectedTwilioNumber}</div>
              <div>• PostgresSaver RLS Boundary: Enabled</div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="w-1/3 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCompleteOnboarding}
                disabled={submitting}
                className="w-2/3 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                {submitting ? 'Provisioning Workspace...' : 'Complete Setup & Launch Dashboard'} <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
