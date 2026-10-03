import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { catalogue, findModel } from './catalogue.ts';
import type { Config } from './config.ts';
import type { Job, Operation, Provider, ProviderAdapter, ProviderContext, ProviderResult, StoredJob } from './contracts.ts';
import { ImageError } from './errors.ts';
import { dispatchCancellation, executeJob } from './execution.ts';
import { Http } from './http.ts';
import { digest, checkDestination } from './images.ts';
import { prepare } from './prepare.ts';
import { createAdapters } from './providers/index.ts';
import { imageEndpoints } from './providers/openrouter.ts';
import { parseRequest } from './schema.ts';
import { isProcessAlive, JobStore } from './store.ts';

const finalStates = new Set(['completed', 'failed', 'cancelled']);

export class Runtime {
  readonly config: Config;
  readonly store: JobStore;
  readonly http: Http;
  private readonly adapters: Record<Provider, ProviderAdapter>;
  private readonly active = new Map<string, { promise: Promise<void>; controller: AbortController }>();

  constructor(config: Config, store: JobStore, http = new Http(), adapters = createAdapters(config, http)) {
    this.config = config;
    this.store = store;
    this.http = http;
    this.adapters = adapters;
  }

  listModels(provider?: Provider) {
    return catalogue.filter(model => !provider || model.provider === provider)
      .map(model => ({ ...model, credential_configured: this.config.configured(model.provider) }));
  }

  async getModel(provider: Provider, id: string) {
    const model = findModel(provider, id);
    if (provider === 'openrouter' && model.api === 'images') {
      return { ...model, endpoints: await imageEndpoints(id, this.http), observed_at: new Date().toISOString() };
    }
    return model;
  }

  async start(raw: unknown, operation: Operation): Promise<Job> {
    const request = parseRequest(raw, operation);
    const id = digest(request.request_id);
    const fingerprint = digest(JSON.stringify({ operation, request }));
    const existing = this.store.get(id);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new ImageError('REQUEST_CONFLICT', 'This request ID already belongs to different inputs. Use a new ID for a new action.');
      }
      return this.get(id);
    }
    this.config.key(request.provider);
    const input = await prepare(request, operation, this.store);
    await checkDestination(request.output_directory);
    const now = new Date().toISOString();
    const record: StoredJob = {
      fingerprint, owner: randomUUID(), owner_pid: process.pid,
      job: { id, provider: request.provider, model: request.model, operation, state: 'submitted',
        created_at: now, updated_at: now, output_directory: request.output_directory, artifacts: [] },
    };
    if (!this.store.create(record)) {
      const winner = this.store.get(id);
      if (winner?.fingerprint !== fingerprint) throw new ImageError('REQUEST_CONFLICT', 'Another action claimed this request ID.');
      return this.get(id);
    }
    const adapter = this.adapters[request.provider];
    this.launch(record, context => adapter.submit(input, context));
    return this.get(id);
  }

  async get(id: string, recover = true): Promise<Job> {
    let record = this.store.get(id);
    if (!record) throw new ImageError('JOB_NOT_FOUND', 'No job with this ID exists in the configured data directory.');
    if (recover && !finalStates.has(record.job.state) && !this.active.has(id) && !isProcessAlive(record.owner_pid)) {
      const claimed = this.store.claim(id, record.owner, randomUUID());
      if (claimed) {
        record = claimed;
        const recover = this.adapters[record.job.provider].recover;
        const providerId = record.job.provider_job_id;
        if (record.result || (recover && providerId)) {
          this.launch(record, context => {
            if (recover && providerId) return recover(providerId, context);
            throw new ImageError('RECOVERY_UNAVAILABLE', 'No recoverable provider job is available.');
          });
        } else {
          record.job.state = 'unknown';
          record.job.error = { code: 'OUTCOME_UNKNOWN', message: 'The previous process ended without a recoverable result. The request was not resubmitted.' };
          this.store.save(record);
          this.store.release(record);
        }
      }
    }
    const job = structuredClone(record.job);
    if (this.store.isCancelRequested(id) && !finalStates.has(job.state) && job.state !== 'unknown') job.state = 'cancel_requested';
    return job;
  }

  async wait(id: string, milliseconds: number): Promise<Job> {
    const deadline = Date.now() + milliseconds;
    let recover = true;
    for (;;) {
      const job = await this.get(id, recover);
      recover = false;
      if (finalStates.has(job.state) || job.state === 'unknown' || Date.now() >= deadline) return job;
      if (job.state === 'saving' && job.error) return job;
      await delay(Math.min(200, Math.max(0, deadline - Date.now())));
    }
  }

  async cancel(id: string): Promise<Job> {
    const job = await this.get(id);
    if (finalStates.has(job.state)) return job;
    this.store.requestCancel(id);
    const adapter = this.adapters[job.provider];
    const record = this.store.get(id);
    if (record && adapter.cancel) await dispatchCancellation(record, this.store, adapter);
    else this.active.get(id)?.controller.abort();
    return this.get(id);
  }

  private launch(record: StoredJob, operation: (context: ProviderContext) => Promise<ProviderResult>): void {
    const controller = new AbortController();
    const promise = executeJob(record, this.store, this.http, operation, this.adapters[record.job.provider], controller)
      .catch(() => { process.stderr.write(`Job ${record.job.id}: state persistence failed; inspect the data directory.\n`); })
      .finally(() => this.active.delete(record.job.id));
    this.active.set(record.job.id, { promise, controller });
  }

  async close(): Promise<void> {
    for (const task of this.active.values()) task.controller.abort();
    await Promise.all([...this.active.values()].map(task => task.promise));
    this.store.close();
  }
}
