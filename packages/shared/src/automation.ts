export type ScheduleType = 'once' | 'daily' | 'weekly' | 'interval' | 'cron';
export interface Schedule {
  type: ScheduleType; timezone: string; time: string; weekdays: number[];
  intervalMinutes: number; cron: string; runAt: string;
}
export interface RecurringTask {
  id: string; name: string; description: string; employeeId: string; providerId: string; model: string;
  instructions: string; expectedOutput: string; projectPath: string; tools: string[]; priority: 'Low' | 'Normal' | 'High';
  schedule: Schedule; outputDestination: 'printer' | 'laptop' | 'both'; notify: boolean; autoDeliver: boolean;
  retryOnFailure: boolean; maxRetries: number; retryDelayMinutes: number;
  enabled: boolean; pausedReason?: string; nextRunAt?: string; lastRunAt?: string;
  createdAt: string; updatedAt: string; deletedAt?: string; copiedFromId?: string;
}
export interface ScheduleRun {
  id: string; recurringTaskId: string; employeeId: string; scheduledAt: string; taskId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';
  attempt: number; errors: string[]; nextRetryAt?: string; createdAt: string; completedAt?: string;
}
export interface ScheduledTaskSource { scheduleId: string; runId: string; notify: boolean; autoDeliver: boolean; outputDestination: 'printer' | 'laptop' | 'both' }
