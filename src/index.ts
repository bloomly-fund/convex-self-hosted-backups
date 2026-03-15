import { CronJob } from "cron";
import { backup } from "./backup.js";
import { env, parseBackends, BACKUP_SCHEDULES, BackupFrequency } from "./env.js";
import { sendFailureNotification } from "./notify.js";

console.log("NodeJS Version: " + process.version);

const backends = parseBackends();

console.log(`Configured ${backends.length} backend(s): ${backends.map(b => b.name).join(", ")}`);
console.log(`Backup frequencies: ${BACKUP_SCHEDULES.map(f => `${f.frequency} (${f.schedule})`).join(", ")}`);

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const runBackupWithRetry = async (backend: typeof backends[number], frequency: BackupFrequency) => {
  for (let attempt = 0; attempt <= env.BACKUP_MAX_RETRIES; attempt++) {
    try {
      await backup(backend, frequency);
      return;
    } catch (error) {
      const msg = `Backup failed for "${backend.name}" (${frequency}), attempt ${attempt + 1}/${env.BACKUP_MAX_RETRIES + 1}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(msg, error);

      if (attempt < env.BACKUP_MAX_RETRIES) {
        const delaySec = Math.round(env.BACKUP_RETRY_DELAY_MS / 1000);
        console.log(`Retrying in ${delaySec}s...`);
        await delay(env.BACKUP_RETRY_DELAY_MS);
      } else {
        await sendFailureNotification(msg);
        process.exit(1);
      }
    }
  }
};

const runBackupCycle = async (frequency: BackupFrequency) => {
  for (const backend of backends) {
    await runBackupWithRetry(backend, frequency);
  }
};

if (env.RUN_ON_STARTUP || env.SINGLE_SHOT_MODE) {
  console.log("Running on start backup...");

  // On startup / single-shot, run all frequencies
  for (const { frequency } of BACKUP_SCHEDULES) {
    await runBackupCycle(frequency);
  }

  if (env.SINGLE_SHOT_MODE) {
    console.log("Database backup complete, exiting...");
    process.exit(0);
  }
}

for (const { frequency, schedule } of BACKUP_SCHEDULES) {
  const job = new CronJob(schedule, async () => {
    await runBackupCycle(frequency);
  });

  job.start();
  console.log(`Scheduled ${frequency} backup: ${schedule}`);
}

console.log("All backup crons scheduled.");
