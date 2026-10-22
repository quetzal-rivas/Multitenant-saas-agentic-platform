'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Mail, Trash2, Users } from 'lucide-react';

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

interface Member {
  user_id: string;
  email: string | null;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  you: boolean;
}
interface Invite {
  id: string;
  email: string;
  role: 'admin' | 'member';
  created_at: string;
}

/** The organization's members and pending invitations; owners and admins can invite and remove. */
export const TeamMembersPanel: React.FC = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [myRole, setMyRole] = useState<Member['role']>('member');
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ members: Member[]; invites: Invite[]; role: Member['role'] }>('/api/v1/account/members');
      setMembers(data.members);
      setInvites(data.invites);
      setMyRole(data.role);
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const canManage = myRole === 'owner' || myRole === 'admin';

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ status: 'added' | 'invited'; email: string }>('/api/v1/account/members', { method: 'POST', body: JSON.stringify({ email, role }) });
      setNotice({
        ok: true,
        text: res.status === 'added' ? `${res.email} already had an account and was added.` : `Invitation emailed to ${res.email}. They join when they sign in.`,
      });
      setEmail('');
      await load();
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: Member) => {
    if (!confirm(`Remove ${m.email ?? 'this member'} from the organization? They lose access right away.`)) return;
    try {
      await api(`/api/v1/account/members/${m.user_id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    }
  };

  const revoke = async (i: Invite) => {
    try {
      await api(`/api/v1/account/invites/${i.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    }
  };

  if (loading) return <div className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading members…</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Users className="w-5 h-5 text-cyan-400" /> Team members</h2>

      {canManage && (
        <form onSubmit={invite} className="space-y-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">Invite by email</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
            <select value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')} className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
              <option value="member">Member</option>
              {myRole === 'owner' && <option value="admin">Admin</option>}
            </select>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Invite
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">An account can belong to one organization for now. Admins can invite and remove members; only the owner can add admins.</p>
        </form>
      )}

      {notice && (
        <div className={`text-xs flex items-start gap-1.5 ${notice.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
          {notice.ok && <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          {notice.text}
        </div>
      )}

      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-200 truncate">{m.email ?? m.user_id}{m.you && <span className="text-zinc-500"> (you)</span>}</div>
              <div className="text-[11px] text-zinc-500 font-mono">joined {new Date(m.joined_at).toLocaleDateString()}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{m.role}</span>
              {canManage && !m.you && m.role !== 'owner' && (myRole === 'owner' || m.role === 'member') && (
                <button onClick={() => remove(m)} className="p-1.5 text-zinc-500 hover:text-rose-400 rounded" title="Remove member"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
          </div>
        ))}
        {invites.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-900/40 border border-dashed border-zinc-800">
            <div className="min-w-0">
              <div className="text-sm text-zinc-300 truncate">{i.email}</div>
              <div className="text-[11px] text-zinc-500 font-mono">invited {new Date(i.created_at).toLocaleDateString()} · pending</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono uppercase bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{i.role}</span>
              {canManage && <button onClick={() => revoke(i)} className="text-xs text-zinc-500 hover:text-rose-400">Cancel</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
