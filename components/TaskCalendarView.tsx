'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Plus,
  Zap,
  PhoneCall,
  Mail,
  RefreshCw,
  Server,
  Terminal,
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
  ShieldCheck,
  Radio,
  Flame,
  Power,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { ScheduledTask, TaskStatus, ReasoningStep } from '@/lib/demo/legacy_mocks/db';

interface TaskCalendarViewProps {
  tenantId?: string;
  onNavigateToStudio?: () => void;
}

export const TaskCalendarView: React.FC<TaskCalendarViewProps> = ({
  tenantId = 'tenant_enterprise_corp',
}) => {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [queueStats, setQueueStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedTask, setSelectedTask] = useState<ScheduledTask | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState<number>(0);

  // Calendar date state: current viewed month/year
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'timeline' | 'queue'>('calendar');

  // New task form state
  const [formTitle, setFormTitle] = useState<string>('Executive Weekly Briefing via Gmail');
  const [formInstructions, setFormInstructions] = useState<string>(
    'Fetch metric highlights and send executive briefing to boss. If email fails, trigger voice call alert.'
  );
  const [formScheduledAt, setFormScheduledAt] = useState<string>(() => {
    const future = new Date(Date.now() + 1000 * 60 * 30); // 30 mins ahead
    return future.toISOString().slice(0, 16);
  });
  const [formSubscribedProfileIds, setFormSubscribedProfileIds] = useState<string>('');
  const [formAllowedTools, setFormAllowedTools] = useState<string[]>([
    'gmail_send_message',
    'elevenlabs_trigger_call',
  ]);
  const [formFallbackTool, setFormFallbackTool] = useState<string>('elevenlabs_trigger_call');
  const [formEscalationInstructions, setFormEscalationInstructions] = useState<string>(
    'If email delivery fails, immediately trigger an automated voice call via ElevenLabs to alert the boss.'
  );
  const [formContactBoss, setFormContactBoss] = useState<string>('+1 (555) 438-9021');
  const [formSimulateFailure, setFormSimulateFailure] = useState<boolean>(false);
  const [formCategory, setFormCategory] = useState<'email' | 'voice' | 'calendar' | 'maintenance'>('email');

  // Fetch tasks and queue stats
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/tasks?tenant_id=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
        setQueueStats(data.queueStats || null);
        setNowTimestamp(Date.now());
      }
    } catch (err) {
      console.error('Failed to load scheduled tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    const initialLoad = async () => {
      try {
        const res = await fetch(`/api/v1/tasks?tenant_id=${tenantId}`);
        if (res.ok && active) {
          const data = await res.json();
          setTasks(data.tasks || []);
          setQueueStats(data.queueStats || null);
          setNowTimestamp(Date.now());
        }
      } catch (err) {
        console.error('Failed to load scheduled tasks:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    initialLoad();
    const interval = setInterval(initialLoad, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [tenantId]);

  // Trigger task immediately (Run Now)
  const handleTriggerNow = async (taskId: string) => {
    setIsExecuting(true);
    try {
      const res = await fetch(`/api/v1/tasks/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_now' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          setSelectedTask(data.task);
          setActionNotice(`Task "${data.task.title}" finished with status: ${data.task.status}`);
          setTimeout(() => setActionNotice(null), 5000);
        }
        fetchTasks();
      }
    } catch (err) {
      console.error('Error triggering task execution:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  // Toggle simulate failure for testing escalation
  const handleToggleSimulateFailure = async (taskId: string) => {
    try {
      const res = await fetch(`/api/v1/tasks/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_simulate_failure' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (selectedTask && selectedTask.id === taskId) {
          setSelectedTask({ ...selectedTask, simulate_failure: data.simulate_failure });
        }
        setActionNotice(
          data.simulate_failure
            ? 'Simulate Failure ENABLED. On next run, the primary tool will fail and trigger ElevenLabs voice escalation!'
            : 'Simulate Failure DISABLED. Primary tool will succeed normally.'
        );
        setTimeout(() => setActionNotice(null), 5000);
        fetchTasks();
      }
    } catch (err) {
      console.error('Error toggling failure:', err);
    }
  };

  // Simulate server crash
  const handleSimulateCrash = async () => {
    try {
      const res = await fetch('/api/v1/tasks/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'simulate_crash' }),
      });
      if (res.ok) {
        const data = await res.json();
        setActionNotice(`💥 ${data.message}`);
        setTimeout(() => setActionNotice(null), 6000);
        fetchTasks();
      }
    } catch (err) {
      console.error('Crash simulation error:', err);
    }
  };

  // Simulate server restart / recovery
  const handleSimulateRestart = async () => {
    try {
      const res = await fetch('/api/v1/tasks/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'simulate_restart' }),
      });
      if (res.ok) {
        const data = await res.json();
        setActionNotice(`🔄 ${data.message}`);
        setTimeout(() => setActionNotice(null), 6000);
        fetchTasks();
      }
    } catch (err) {
      console.error('Restart simulation error:', err);
    }
  };

  // Submit new task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const scheduledIso = new Date(formScheduledAt).toISOString();
      const payload = {
        title: formTitle,
        instructions: formInstructions,
        scheduled_at: scheduledIso,
        subscribed_profile_ids: formSubscribedProfileIds.split(',').map(s => s.trim()).filter(Boolean),
        allowed_tools: formAllowedTools,
        fallback_policy: {
          on_failure: 'escalate',
          fallback_tool: formFallbackTool,
          escalation_instructions: formEscalationInstructions,
          contact_overrides: {
            boss: formContactBoss,
          },
          max_retries: 1,
        },
        category: formCategory,
        simulate_failure: formSimulateFailure,
        tenant_id: tenantId,
      };

      const res = await fetch('/api/v1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setIsScheduleModalOpen(false);
        setActionNotice(`Task "${data.task.title}" scheduled into durable queue!`);
        setTimeout(() => setActionNotice(null), 5000);
        fetchTasks();
      } else {
        const err = await res.json();
        alert(`Validation error: ${err.error || JSON.stringify(err.validationErrors)}`);
      }
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  // Reset to default demo tasks
  const handleResetTasks = async () => {
    try {
      const res = await fetch('/api/v1/tasks?action=reset', { method: 'DELETE' });
      if (res.ok) {
        fetchTasks();
        setSelectedTask(null);
        setActionNotice('Restored default demo scheduled tasks.');
        setTimeout(() => setActionNotice(null), 4000);
      }
    } catch (err) {
      console.error('Failed to reset tasks:', err);
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (filterStatus === 'ALL') return true;
    return t.status === filterStatus;
  });

  // Calendar navigation helpers
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Helper to get status pill styling
  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'SCHEDULED':
        return 'bg-cyan-950/80 text-cyan-400 border-cyan-800/60';
      case 'QUEUED':
        return 'bg-blue-950/80 text-blue-400 border-blue-800/60';
      case 'RUNNING':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/60 animate-pulse';
      case 'COMPLETED':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60';
      case 'ESCALATED':
        return 'bg-purple-950/80 text-purple-300 border-purple-800/60';
      case 'FAILED':
        return 'bg-rose-950/80 text-rose-400 border-rose-800/60';
      case 'CANCELLED':
        return 'bg-zinc-800 text-zinc-500 border-zinc-700';
      default:
        return 'bg-zinc-900 text-zinc-400 border-zinc-800';
    }
  };

  // Helper for quick countdown
  const getRelativeTime = (isoString: string) => {
    if (!nowTimestamp) return '';
    const diff = new Date(isoString).getTime() - nowTimestamp;
    if (diff < 0) {
      const agoSec = Math.round(Math.abs(diff) / 1000);
      if (agoSec < 60) return `${agoSec}s ago`;
      const agoMin = Math.round(agoSec / 60);
      if (agoMin < 60) return `${agoMin}m ago`;
      const agoHr = Math.round(agoMin / 60);
      return `${agoHr}h ago`;
    }
    const sec = Math.round(diff / 1000);
    if (sec < 60) return `in ${sec}s`;
    const min = Math.round(sec / 60);
    if (min < 60) return `in ${min}m`;
    const hr = Math.round(min / 60);
    return `in ${hr}h`;
  };

  return (
    <div className="h-full flex flex-col bg-[#090b10] text-zinc-100 overflow-hidden">
      {/* Top Banner Notice */}
      {actionNotice && (
        <div className="px-6 py-2.5 bg-emerald-950/90 border-b border-emerald-800/80 text-emerald-200 text-xs font-mono flex items-center justify-between shrink-0 animate-fadeIn">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-zinc-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Header & Durable Queue Status Bar */}
      <div className="px-6 py-4 border-b border-zinc-800 bg-[#0d1017] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shadow-sm">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                Durable Task Scheduler & Calendar
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                  BullMQ + Redis WAL
                </span>
              </h1>
              <p className="text-xs text-zinc-400">
                Crash-resistant agent execution with LangGraph escalation fallback (Email &rarr; ElevenLabs Voice Call)
              </p>
            </div>
          </div>
        </div>

        {/* Queue Resilience & Actions */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {/* Durable Engine Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg">
            <Radio
              className={`w-3.5 h-3.5 ${
                queueStats?.isCrashed ? 'text-rose-500 animate-ping' : 'text-emerald-400 animate-pulse'
              }`}
            />
            <span className="text-zinc-400">Engine:</span>
            <span className={queueStats?.isCrashed ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
              {queueStats?.isCrashed ? 'CRASHED (WAL SAFE)' : 'DURABLE ONLINE'}
            </span>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-300">
              {queueStats?.delayed || 0} delayed
            </span>
          </div>

          {/* Crash Test Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleSimulateCrash}
              title="Simulate process kill/crash to test durable persistence"
              className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 rounded-lg transition-all flex items-center gap-1.5"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Kill Process</span>
            </button>
            <button
              onClick={handleSimulateRestart}
              title="Re-boot process and re-hydrate timers from durable journal"
              className="px-2.5 py-1.5 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/50 rounded-lg transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart & Recover</span>
            </button>
          </div>

          {/* Schedule Task CTA */}
          <button
            onClick={() => setIsScheduleModalOpen(true)}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule Task</span>
          </button>
        </div>
      </div>

      {/* Filter & View Switcher Toolbar */}
      <div className="px-6 py-2.5 bg-zinc-950/60 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        {/* View Switcher */}
        <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1 rounded-md transition-all font-medium flex items-center gap-1.5 ${
              viewMode === 'calendar' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Calendar View</span>
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1 rounded-md transition-all font-medium flex items-center gap-1.5 ${
              viewMode === 'timeline' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Timeline / Agenda</span>
          </button>
          <button
            onClick={() => setViewMode('queue')}
            className={`px-3 py-1 rounded-md transition-all font-medium flex items-center gap-1.5 ${
              viewMode === 'queue' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Queue Watcher</span>
          </button>
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar font-mono text-[11px]">
          {['ALL', 'SCHEDULED', 'QUEUED', 'RUNNING', 'COMPLETED', 'ESCALATED', 'FAILED'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filterStatus === st
                  ? 'bg-zinc-800 text-emerald-400 font-semibold border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              {st}
            </button>
          ))}
          <button
            onClick={handleResetTasks}
            title="Reset to default scheduled task scenarios"
            className="px-2 py-1 text-zinc-500 hover:text-zinc-300 ml-2"
          >
            Reset Demo
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Calendar / Timeline Matrix */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {viewMode === 'calendar' && (
            <div className="bg-[#0d1017] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-xl">
              {/* Calendar Month Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-bold text-white tracking-wide">
                    {monthNames[currentMonth]} {currentYear}
                  </h2>
                  <span className="text-xs font-mono text-zinc-500">
                    {filteredTasks.length} tasks recorded
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={prevMonth}
                    className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg border border-zinc-800 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    className="px-2.5 py-1 text-xs font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg border border-zinc-800"
                  >
                    Today
                  </button>
                  <button
                    onClick={nextMonth}
                    className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg border border-zinc-800 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Calendar Days Grid */}
              <div className="grid grid-cols-7 gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div
                    key={d}
                    className="text-center font-mono text-[11px] font-semibold text-zinc-500 py-1 uppercase tracking-wider"
                  >
                    {d}
                  </div>
                ))}

                {/* Empty cells before month starts */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[100px] rounded-lg bg-zinc-950/30 border border-zinc-900/50 opacity-40" />
                ))}

                {/* Day cells */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dayDate = new Date(currentYear, currentMonth, dayNum);
                  const isToday =
                    new Date().toDateString() === dayDate.toDateString();

                  // Find tasks scheduled on this day
                  const dayTasks = filteredTasks.filter((t) => {
                    const taskDate = new Date(t.scheduled_at);
                    return (
                      taskDate.getFullYear() === currentYear &&
                      taskDate.getMonth() === currentMonth &&
                      taskDate.getDate() === dayNum
                    );
                  });

                  return (
                    <div
                      key={`day-${dayNum}`}
                      onClick={() => {
                        const target = new Date(currentYear, currentMonth, dayNum, 10, 0);
                        setFormScheduledAt(target.toISOString().slice(0, 16));
                        setIsScheduleModalOpen(true);
                      }}
                      className={`min-h-[105px] p-2 rounded-lg border transition-all cursor-pointer flex flex-col justify-between group ${
                        isToday
                          ? 'bg-zinc-900/80 border-emerald-500/50 shadow-sm'
                          : 'bg-zinc-900/40 border-zinc-800/70 hover:border-zinc-700 hover:bg-zinc-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded ${
                            isToday
                              ? 'bg-emerald-500 text-black font-bold'
                              : 'text-zinc-400 group-hover:text-white'
                          }`}
                        >
                          {dayNum}
                        </span>
                        {dayTasks.length > 0 && (
                          <span className="text-[10px] font-mono text-zinc-500">
                            {dayTasks.length} {dayTasks.length === 1 ? 'task' : 'tasks'}
                          </span>
                        )}
                      </div>

                      {/* Day Task List */}
                      <div className="space-y-1.5 mt-2">
                        {dayTasks.slice(0, 3).map((t) => (
                          <div
                            key={t.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTask(t);
                            }}
                            className={`p-1.5 rounded text-[11px] border flex items-center justify-between gap-1 transition-transform hover:scale-[1.02] ${getStatusBadge(
                              t.status
                            )}`}
                          >
                            <span className="truncate font-medium">{t.title}</span>
                            {t.status === 'ESCALATED' && (
                              <PhoneCall className="w-3 h-3 text-purple-300 shrink-0" />
                            )}
                          </div>
                        ))}
                        {dayTasks.length > 3 && (
                          <div className="text-[10px] font-mono text-zinc-500 text-center">
                            +{dayTasks.length - 3} more
                          </div>
                        )}
                      </div>

                      {/* Hover action hint */}
                      <div className="text-[10px] text-zinc-600 opacity-0 group-hover:opacity-100 font-mono transition-opacity text-right">
                        + click to schedule
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === 'timeline' && (
            <div className="bg-[#0d1017] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold text-white font-mono uppercase tracking-wider flex items-center justify-between">
                <span>Task Execution Agenda & Timeline</span>
                <span className="text-xs font-normal text-zinc-400">
                  Ordered chronologically by execution timestamp
                </span>
              </h2>

              <div className="space-y-3">
                {filteredTasks.map((t) => {
                  const targetDate = new Date(t.scheduled_at);

                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTask(t)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        selectedTask?.id === t.id
                          ? 'bg-zinc-800/80 border-emerald-500'
                          : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="space-y-1.5 max-w-xl">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${getStatusBadge(
                              t.status
                            )}`}
                          >
                            {t.status}
                          </span>
                          <span className="text-xs font-mono text-zinc-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {targetDate.toLocaleString()} ({getRelativeTime(t.scheduled_at)})
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-zinc-100">{t.title}</h3>
                        <p className="text-xs text-zinc-400 line-clamp-2">{t.instructions}</p>
                      </div>

                      <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                        {t.status === 'ESCALATED' && (
                          <div className="px-2.5 py-1 bg-purple-950/80 border border-purple-800 text-purple-300 rounded-lg flex items-center gap-1.5 text-[11px]">
                            <PhoneCall className="w-3 h-3 text-purple-400" />
                            <span>ElevenLabs Escalated</span>
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTriggerNow(t.id);
                          }}
                          disabled={isExecuting}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg flex items-center gap-1 transition-all"
                        >
                          <Play className="w-3 h-3" />
                          <span>Run Now</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === 'queue' && (
            <div className="bg-[#0d1017] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white font-mono uppercase tracking-wider">
                    Durable BullMQ / Redis Queue Monitor
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Jobs survive container restarts via the durable write-ahead journal
                  </p>
                </div>
                <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Durable Execution Active</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
                  <div className="text-[11px] font-mono text-zinc-400">TOTAL TASKS</div>
                  <div className="text-2xl font-bold text-white">{tasks.length}</div>
                </div>
                <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
                  <div className="text-[11px] font-mono text-zinc-400">DELAYED / PENDING</div>
                  <div className="text-2xl font-bold text-cyan-400">{queueStats?.delayed || 0}</div>
                </div>
                <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
                  <div className="text-[11px] font-mono text-zinc-400">COMPLETED</div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {tasks.filter((t) => t.status === 'COMPLETED').length}
                  </div>
                </div>
                <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
                  <div className="text-[11px] font-mono text-zinc-400">ESCALATED TO VOICE</div>
                  <div className="text-2xl font-bold text-purple-400">
                    {tasks.filter((t) => t.status === 'ESCALATED').length}
                  </div>
                </div>
              </div>

              {/* Task table */}
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-900/90 text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="p-3">Task Title</th>
                      <th className="p-3">Target Time</th>
                      <th className="p-3">Allowed Tools</th>
                      <th className="p-3">Fallback Tool</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 bg-zinc-950/40">
                    {tasks.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedTask(t)}
                        className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                      >
                        <td className="p-3 font-medium text-zinc-200">{t.title}</td>
                        <td className="p-3 text-zinc-400">{getRelativeTime(t.scheduled_at)}</td>
                        <td className="p-3 text-zinc-300">
                          {Array.isArray(t.allowed_tools) ? t.allowed_tools.map((tl) => tl.replace('_', ' ')).join(', ') : 'none'}
                        </td>
                        <td className="p-3 text-purple-300">{t.fallback_policy.fallback_tool}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] ${getStatusBadge(
                              t.status
                            )}`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTriggerNow(t.id);
                            }}
                            className="text-emerald-400 hover:text-emerald-300 hover:underline"
                          >
                            Run Now
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Task Inspector Drawer */}
        {selectedTask ? (
          <div className="w-96 border-l border-zinc-800 bg-[#0c0f16] flex flex-col h-full shrink-0 shadow-2xl animate-fadeIn">
            {/* Drawer Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="space-y-0.5">
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${getStatusBadge(
                    selectedTask.status
                  )}`}
                >
                  {selectedTask.status}
                </span>
                <h3 className="text-sm font-semibold text-white truncate max-w-[240px]">
                  {selectedTask.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Timing info */}
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1.5 font-mono">
                <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                  <span>TARGET EXECUTION:</span>
                  <span className="text-zinc-200">{getRelativeTime(selectedTask.scheduled_at)}</span>
                </div>
                <div className="text-zinc-300 font-semibold">
                  {new Date(selectedTask.scheduled_at).toLocaleString()}
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-1">
                <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                  Task Instructions
                </div>
                <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-200 text-xs leading-relaxed">
                  {selectedTask.instructions}
                </div>
              </div>

              {/* Fallback Policy & Contact Overrides */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Fallback Policy & Escalation Edge</span>
                  <span className="text-purple-400 font-semibold">ElevenLabs</span>
                </div>
                <div className="p-3 bg-purple-950/30 border border-purple-800/40 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">On Failure:</span>
                    <span className="font-mono text-purple-300 font-bold uppercase">
                      {selectedTask.fallback_policy.on_failure}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Fallback Tool:</span>
                    <span className="font-mono text-purple-300">
                      {selectedTask.fallback_policy.fallback_tool}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-300 leading-relaxed pt-1 border-t border-purple-900/50">
                    <span className="text-zinc-400 font-mono">Escalation: </span>
                    {selectedTask.fallback_policy.escalation_instructions}
                  </div>
                  {selectedTask.fallback_policy.contact_overrides && (
                    <div className="pt-1.5 border-t border-purple-900/50 space-y-1">
                      <div className="text-[10px] font-mono text-zinc-400">CONTACT OVERRIDES:</div>
                      {Object.entries(selectedTask.fallback_policy.contact_overrides).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-zinc-400">&quot;{k}&quot; &rarr;</span>
                          <span className="text-emerald-400 font-semibold">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Simulate Failure Switch (for demo testing) */}
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-zinc-300 font-semibold">
                    Simulate Primary Failure
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedTask.simulate_failure)}
                    onChange={() => handleToggleSimulateFailure(selectedTask.id)}
                    className="cursor-pointer accent-rose-500 w-4 h-4"
                  />
                </div>
                <p className="text-[11px] text-zinc-400 leading-normal">
                  When enabled, the primary tool (e.g. Gmail SMTP) simulates a service failure so you can watch the LangGraph agent traverse the escalation edge and trigger the ElevenLabs voice call!
                </p>
              </div>

              {/* LangGraph Reasoning Steps Execution Trace */}
              {selectedTask.execution_result && (
                <div className="space-y-2">
                  <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                    <span>LangGraph Reasoning Trace</span>
                    <span className="text-emerald-400">
                      {selectedTask.execution_result.reasoning_steps.length} Nodes
                    </span>
                  </div>

                  <div className="space-y-2 font-mono text-[11px]">
                    {selectedTask.execution_result.reasoning_steps.map((step, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border space-y-1 ${
                          step.node === 'escalate_and_fallback'
                            ? 'bg-purple-950/40 border-purple-800 text-purple-200'
                            : step.status === 'FAILED'
                            ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold flex items-center gap-1">
                            {step.node === 'escalate_and_fallback' && (
                              <Flame className="w-3 h-3 text-purple-400" />
                            )}
                            {step.node}
                          </span>
                          <span
                            className={`text-[10px] px-1 rounded ${
                              step.status === 'SUCCESS'
                                ? 'bg-emerald-950 text-emerald-400'
                                : step.status === 'FAILED'
                                ? 'bg-rose-950 text-rose-400'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {step.status}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400">{step.action}</div>
                      </div>
                    ))}
                  </div>

                  {/* Summary */}
                  {selectedTask.execution_result.final_summary && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-[11px]">
                      <strong>Final Summary: </strong>
                      {selectedTask.execution_result.final_summary}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={() => handleTriggerNow(selectedTask.id)}
                  disabled={isExecuting}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all text-xs shadow-sm"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{isExecuting ? 'Running Graph...' : 'Execute Now'}</span>
                </button>
                <button
                  onClick={async () => {
                    await fetch(`/api/v1/tasks/${selectedTask.id}`, { method: 'DELETE' });
                    setSelectedTask(null);
                    fetchTasks();
                  }}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-all text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Empty Inspector State */
          <div className="hidden lg:flex w-80 border-l border-zinc-800 bg-[#0c0f16]/60 p-6 flex-col items-center justify-center text-center space-y-3 text-zinc-500 shrink-0">
            <CalendarIcon className="w-8 h-8 text-zinc-600" />
            <div className="text-xs font-medium text-zinc-400">Select any task on the calendar</div>
            <p className="text-[11px] text-zinc-500 max-w-xs">
              Inspect the LangGraph reasoning nodes, MCP tool outputs, and test the ElevenLabs fallback escalation path.
            </p>
          </div>
        )}
      </div>

      {/* Schedule Task Intake Modal (Zod Validated) */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f121a] border border-zinc-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-scaleIn">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-white">
                  Schedule Durable AI Agent Task
                </h3>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-5 space-y-4 text-xs">
              {/* Presets */}
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] text-zinc-400 uppercase tracking-wider">
                  Quick Presets
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormTitle('Weekly Summary Report via Email');
                      setFormInstructions('Fetch metrics, build summary report, and email to boss via Gmail.');
                      setFormAllowedTools(['gmail_send_message', 'elevenlabs_trigger_call']);
                      setFormFallbackTool('elevenlabs_trigger_call');
                      setFormEscalationInstructions('Trigger a voice call via ElevenLabs to alert boss of failure.');
                      setFormContactBoss('+1 (555) 438-9021');
                    }}
                    className="p-2 text-left rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 transition-all font-mono text-[11px]"
                  >
                    📧 Email + Voice Fallback
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormTitle('Kickoff Meeting Calendar Sync');
                      setFormInstructions('Create kickoff event on Google Calendar and send attendee invites.');
                      setFormAllowedTools(['calendar_create_event', 'elevenlabs_trigger_call']);
                      setFormFallbackTool('elevenlabs_trigger_call');
                      setFormEscalationInstructions('Call organizer via ElevenLabs if calendar slot is occupied.');
                      setFormContactBoss('+1 (555) 892-1002');
                    }}
                    className="p-2 text-left rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 transition-all font-mono text-[11px]"
                  >
                    📅 Calendar + Alert Call
                  </button>
                </div>
              </div>

              {/* Title */}
              <div className="space-y-1">
                <label className="font-mono text-[11px] text-zinc-400">TASK TITLE</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Instructions */}
              <div className="space-y-1">
                <label className="font-mono text-[11px] text-zinc-400">WHAT TO DO (INSTRUCTIONS / GOAL)</label>
                <textarea
                  required
                  rows={2}
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {/* Heartbeat Subscriptions */}
              <div className="space-y-1">
                <label className="font-mono text-[11px] text-zinc-400">
                  AGENT HEARTBEAT SUBSCRIPTIONS (PROFILE IDs)
                </label>
                <input
                  type="text"
                  value={formSubscribedProfileIds}
                  onChange={(e) => setFormSubscribedProfileIds(e.target.value)}
                  placeholder="e.g. team_front_desk, team_sre_ops (comma separated)"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-zinc-500">
                  Subscribed agents will be synchronously woken up and sent the task instructions when this timer triggers.
                </p>
              </div>

              {/* Target Execution Time */}
              <div className="space-y-1">
                <label className="font-mono text-[11px] text-zinc-400">
                  WHEN TO DO IT (TARGET TIMESTAMP)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formScheduledAt}
                  onChange={(e) => setFormScheduledAt(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Fallback Policy */}
              <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg space-y-2">
                <div className="font-mono text-[11px] text-purple-400 font-semibold flex items-center justify-between">
                  <span>FALLBACK ESCALATION DIRECTIVES</span>
                  <span>ElevenLabs</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-mono">
                    ESCALATION INSTRUCTIONS (IF PRIMARY TOOL FAILS)
                  </label>
                  <input
                    type="text"
                    required
                    value={formEscalationInstructions}
                    onChange={(e) => setFormEscalationInstructions(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-mono">
                    CONTACT OVERRIDE: &quot;boss&quot; PHONE NUMBER
                  </label>
                  <input
                    type="text"
                    required
                    value={formContactBoss}
                    onChange={(e) => setFormContactBoss(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1.5 text-emerald-400 font-mono"
                  />
                </div>
              </div>

              {/* Simulate Failure */}
              <div className="flex items-center justify-between p-2.5 bg-zinc-900/40 border border-zinc-800 rounded-lg">
                <div>
                  <div className="font-mono text-zinc-200 text-xs">Simulate Primary Tool Failure</div>
                  <div className="text-[10px] text-zinc-400">Trigger ElevenLabs voice fallback on run</div>
                </div>
                <input
                  type="checkbox"
                  checked={formSimulateFailure}
                  onChange={(e) => setFormSimulateFailure(e.target.checked)}
                  className="cursor-pointer accent-rose-500 w-4 h-4"
                />
              </div>

              {/* Submit */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg flex items-center gap-1.5 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Commit to Queue</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
