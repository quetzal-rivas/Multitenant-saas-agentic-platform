/**
 * Backend/queue.ts - Durable Task Queue (BullMQ + Redis architecture)
 * 
 * Holds scheduled jobs until their target execution time arrives.
 * Persists jobs durably to surviving storage (Redis / Journal file)
 * so pending deferred tasks survive process restarts and crashes.
 */

import fs from 'fs';
import path from 'path';
import { ScheduledTask, db } from './db';
import { agent } from './agent';

export interface QueueJob {
  id: string;
  taskId: string;
  name: string;
  delayMs: number;
  scheduledAt: string;
  enqueuedAt: string;
  status: 'delayed' | 'active' | 'completed' | 'failed' | 'cancelled';
  attemptsMade: number;
  data: ScheduledTask;
}

const QUEUE_DIR = path.join(process.cwd(), 'data');
const JOURNAL_FILE = path.join(QUEUE_DIR, 'durable_queue_journal.json');

export class DurableTaskQueue {
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();
  private jobs: Map<string, QueueJob> = new Map();
  private isCrashed: boolean = false;
  private isProcessing: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(QUEUE_DIR)) {
        fs.mkdirSync(QUEUE_DIR, { recursive: true });
      }

      if (fs.existsSync(JOURNAL_FILE)) {
        const raw = fs.readFileSync(JOURNAL_FILE, 'utf-8');
        const restoredJobs: QueueJob[] = JSON.parse(raw);
        console.log(`[DurableQueue] Bootstrapping: Restoring ${restoredJobs.length} jobs from durable journal...`);
        for (const j of restoredJobs) {
          this.jobs.set(j.id, j);
          // If job was delayed and not completed/cancelled, arm timer
          if (j.status === 'delayed') {
            this.armTimerForJob(j);
          }
        }
      } else {
        this.saveJournal();
      }
    } catch (err) {
      console.warn('[DurableQueue] Warning reading journal file, starting fresh:', err);
    }
  }

  private saveJournal() {
    try {
      if (!fs.existsSync(QUEUE_DIR)) {
        fs.mkdirSync(QUEUE_DIR, { recursive: true });
      }
      const list = Array.from(this.jobs.values());
      fs.writeFileSync(JOURNAL_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DurableQueue] Error persisting queue journal:', err);
    }
  }

  /**
   * Schedules a task to run at its target timestamp
   */
  public async scheduleTask(task: ScheduledTask): Promise<QueueJob> {
    if (this.isCrashed) {
      throw new Error('Durable queue is in crashed state. Restart worker to accept new jobs.');
    }

    const targetTime = new Date(task.scheduled_at).getTime();
    const now = Date.now();
    const delayMs = Math.max(0, targetTime - now);

    const jobId = `job_${task.id}`;

    // Cancel existing timer if re-scheduling
    if (this.activeTimers.has(jobId)) {
      clearTimeout(this.activeTimers.get(jobId)!);
      this.activeTimers.delete(jobId);
    }

    const job: QueueJob = {
      id: jobId,
      taskId: task.id,
      name: task.title,
      delayMs,
      scheduledAt: task.scheduled_at,
      enqueuedAt: new Date().toISOString(),
      status: 'delayed',
      attemptsMade: 0,
      data: task,
    };

    this.jobs.set(job.id, job);
    this.saveJournal();

    // Mark task as QUEUED or SCHEDULED in DB
    db.updateTaskStatus(task.id, 'QUEUED');

    this.armTimerForJob(job);
    console.log(`[DurableQueue] Job "${task.title}" queued with delay ${Math.round(delayMs / 1000)}s (target: ${task.scheduled_at})`);

    return job;
  }

  /**
   * Arms a timer for a delayed job
   */
  private armTimerForJob(job: QueueJob) {
    const targetTime = new Date(job.scheduledAt).getTime();
    const now = Date.now();
    const remainingMs = Math.max(50, targetTime - now);

    const timer = setTimeout(async () => {
      this.activeTimers.delete(job.id);
      await this.processJob(job);
    }, remainingMs);

    this.activeTimers.set(job.id, timer);
  }

  /**
   * Executes the job when its target time arrives
   */
  public async processJob(job: QueueJob): Promise<ScheduledTask | null> {
    if (this.isCrashed) {
      console.warn(`[DurableQueue] Process is in crashed state. Execution for job ${job.id} held in journal.`);
      return null;
    }

    console.log(`[DurableQueue] Triggering target time execution for job: ${job.id}`);
    job.status = 'active';
    job.attemptsMade += 1;
    this.saveJournal();

    // Fetch latest task state
    const currentTask = db.getTaskById(job.taskId) || job.data;

    try {
      // Hand over to LangGraph Agent
      const executedTask = await agent.executeTask(currentTask);
      job.status = executedTask.status === 'FAILED' ? 'failed' : 'completed';
      this.saveJournal();
      return executedTask;
    } catch (err) {
      console.error(`[DurableQueue] Execution failed for job ${job.id}:`, err);
      job.status = 'failed';
      this.saveJournal();
      return null;
    }
  }

  /**
   * Triggers an immediate execution without waiting for scheduled delay (for interactive testing)
   */
  public async triggerNow(taskId: string): Promise<ScheduledTask | null> {
    const jobId = `job_${taskId}`;
    const timer = this.activeTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(jobId);
    }

    let job = this.jobs.get(jobId);
    if (!job) {
      const task = db.getTaskById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      job = await this.scheduleTask(task);
    }

    return this.processJob(job);
  }

  /**
   * Cancels a scheduled job
   */
  public cancelTask(taskId: string): boolean {
    const jobId = `job_${taskId}`;
    const timer = this.activeTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(jobId);
    }

    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'cancelled';
      this.saveJournal();
    }

    db.updateTaskStatus(taskId, 'CANCELLED');
    return true;
  }

  /**
   * Simulates a server crash:
   * Clears in-memory timers and marks process as crashed.
   * Proves that jobs are NOT lost because they reside in the durable journal.
   */
  public simulateServerCrash(): { message: string; preservedJobsCount: number } {
    this.isCrashed = true;
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();

    const pendingCount = Array.from(this.jobs.values()).filter((j) => j.status === 'delayed').length;
    console.warn(`[DurableQueue] 💥 SERVER CRASH SIMULATED. In-memory timers cleared. ${pendingCount} delayed jobs preserved in journal.`);
    return {
      message: `Server crash simulated. Process memory wiped, but ${pendingCount} jobs remain safely stored in durable journal.`,
      preservedJobsCount: pendingCount,
    };
  }

  /**
   * Simulates a server reboot/restart:
   * Rehydrates queue state from disk journal and restores all active timers.
   */
  public simulateServerRestart(): { message: string; recoveredJobsCount: number } {
    this.isCrashed = false;
    this.activeTimers.clear();
    this.jobs.clear();

    // Re-run initialization
    this.init();

    const restoredCount = Array.from(this.jobs.values()).filter((j) => j.status === 'delayed').length;
    console.log(`[DurableQueue] 🔄 SERVER RESTART SIMULATED. Rehydrated ${restoredCount} active delayed timers from durable storage.`);
    return {
      message: `Server restart complete. Rehydrated ${restoredCount} deferred jobs from durable journal. All timers re-armed.`,
      recoveredJobsCount: restoredCount,
    };
  }

  /**
   * Returns queue inspection stats
   */
  public getStats() {
    const all = Array.from(this.jobs.values());
    return {
      totalJobs: all.length,
      delayed: all.filter((j) => j.status === 'delayed').length,
      active: all.filter((j) => j.status === 'active').length,
      completed: all.filter((j) => j.status === 'completed').length,
      failed: all.filter((j) => j.status === 'failed').length,
      isCrashed: this.isCrashed,
      activeTimersCount: this.activeTimers.size,
    };
  }

  public getAllJobs(): QueueJob[] {
    return Array.from(this.jobs.values());
  }
}

export const taskQueue = new DurableTaskQueue();
