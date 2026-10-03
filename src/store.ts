import { DatabaseSync } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { StoredJob } from './contracts.ts';
import { ImageError } from './errors.ts';

export class JobStore {
  private readonly db: DatabaseSync;

  private constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        owner TEXT NOT NULL,
        owner_pid INTEGER NOT NULL,
        cancel_requested INTEGER NOT NULL DEFAULT 0,
        payload TEXT NOT NULL
      );
    `);
  }

  static async open(directory: string): Promise<JobStore> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    return new JobStore(join(directory, 'jobs.sqlite'));
  }

  get(id: string): StoredJob | undefined {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    if (!row) return undefined;
    if (typeof row.payload !== 'string' || typeof row.fingerprint !== 'string'
      || typeof row.owner !== 'string' || typeof row.owner_pid !== 'number') {
      throw new ImageError('JOB_DATA', 'The job record cannot be read. Preserve the data directory for recovery.');
    }
    const payload: Pick<StoredJob, 'job' | 'result'> = JSON.parse(row.payload);
    return { ...payload, fingerprint: row.fingerprint, owner: row.owner, owner_pid: row.owner_pid };
  }

  create(record: StoredJob): boolean {
    return this.db.prepare(`INSERT INTO jobs (id, fingerprint, owner, owner_pid, payload)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`).run(
      record.job.id, record.fingerprint, record.owner, record.owner_pid,
      JSON.stringify({ job: record.job }),
    ).changes === 1;
  }

  save(record: StoredJob): void {
    record.job.updated_at = new Date().toISOString();
    const result = this.db.prepare('UPDATE jobs SET payload = ? WHERE id = ? AND owner = ?').run(
      JSON.stringify({ job: record.job, result: record.result }), record.job.id, record.owner,
    );
    if (result.changes !== 1) throw new ImageError('JOB_OWNERSHIP', 'Another process owns this job. Fetch its current state.');
  }

  claim(id: string, previousOwner: string, owner: string): StoredJob | undefined {
    const result = this.db.prepare('UPDATE jobs SET owner = ?, owner_pid = ? WHERE id = ? AND owner = ?')
      .run(owner, process.pid, id, previousOwner);
    return result.changes === 1 ? this.get(id) : undefined;
  }

  release(record: StoredJob): void {
    this.db.prepare('UPDATE jobs SET owner = ?, owner_pid = 0 WHERE id = ? AND owner = ?')
      .run('', record.job.id, record.owner);
  }

  requestCancel(id: string): void {
    this.db.prepare('UPDATE jobs SET cancel_requested = 1 WHERE id = ? AND cancel_requested = 0').run(id);
  }

  isCancelRequested(id: string): boolean {
    const flag = this.db.prepare('SELECT cancel_requested FROM jobs WHERE id = ?').get(id)?.cancel_requested;
    return typeof flag === 'number' && flag > 0;
  }

  takeCancellation(id: string): boolean {
    return this.db.prepare('UPDATE jobs SET cancel_requested = 2 WHERE id = ? AND cancel_requested = 1')
      .run(id).changes === 1;
  }

  close(): void { this.db.close(); }
}

export function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}
