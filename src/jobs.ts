import { LRUCache } from "lru-cache";
import type { JobRecord } from "./types.js";

const MAX_CONCURRENT_JOBS = 3;
const SHUTDOWN_TIMEOUT = 30000;
const JOB_TTL = 1000 * 60 * 60 * 24;

export class JobManager {
  private jobs = new LRUCache<string, JobRecord>({ max: 500, ttl: JOB_TTL });
  private jobQueue: string[] = [];
  private runningJobs = 0;
  private executeJobFn: ((job: JobRecord) => Promise<void>) | null = null;

  constructor() {}

  setExecuteJob(fn: (job: JobRecord) => Promise<void>) {
    this.executeJobFn = fn;
  }

  createJob(toolId: string, args: any, priority = 0): JobRecord {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const job: JobRecord = {
      id: jobId,
      status: "queued",
      toolId,
      args,
      priority,
      createdAt: Date.now(),
      logs: [`Job created: ${toolId}`],
    };
    this.jobs.set(jobId, job);
    this.jobQueue.push(jobId);
    this.jobQueue.sort((a, b) => (this.jobs.get(b)?.priority || 0) - (this.jobs.get(a)?.priority || 0));
    return job;
  }

  getJob(jobId: string): JobRecord | undefined {
    return this.jobs.get(jobId);
  }

  processQueue() {
    while (this.runningJobs < MAX_CONCURRENT_JOBS && this.jobQueue.length > 0) {
      const jobId = this.jobQueue.shift()!;
      const job = this.jobs.get(jobId);
      if (!job || !this.executeJobFn) continue;

      this.runningJobs++;
      this.executeJobFn(job).finally(() => {
        this.runningJobs--;
        this.processQueue();
      });
    }
  }

  getRunningCount(): number {
    return this.runningJobs;
  }

  async shutdown(): Promise<void> {
    this.jobQueue = [];
    const startTime = Date.now();
    while (this.runningJobs > 0 && Date.now() - startTime < SHUTDOWN_TIMEOUT) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  getStats(): { queued: number; running: number; total: number } {
    return {
      queued: this.jobQueue.length,
      running: this.runningJobs,
      total: this.jobs.size,
    };
  }
}
