import type { ProviderAdapter, ProviderContext, ProviderResult, StoredJob } from './contracts.ts';
import type { JobStore } from './store.ts';
import type { Http } from './http.ts';
import { ImageError, publicError } from './errors.ts';
import { saveImage } from './images.ts';

export async function dispatchCancellation(record: StoredJob, store: JobStore, adapter: ProviderAdapter): Promise<void> {
  if (adapter.cancel && record.job.provider_job_id && store.takeCancellation(record.job.id)) {
    await adapter.cancel(record.job.provider_job_id);
  }
}

export async function executeJob(
  record: StoredJob, store: JobStore, http: Http,
  operation: (context: ProviderContext) => Promise<ProviderResult>,
  adapter: ProviderAdapter, controller: AbortController,
): Promise<void> {
  let cancelling: Promise<void> | undefined;
  const cancel = () => {
    if (!store.isCancelRequested(record.job.id)) return;
    if (adapter.cancel && record.job.provider_job_id) {
      cancelling ??= dispatchCancellation(record, store, adapter).catch(error => {
        record.job.error = publicError(error);
        store.save(record);
      });
    } else if (!adapter.cancel) controller.abort();
  };
  const timer = setInterval(cancel, 500);
  timer.unref();
  try {
    delete record.job.error;
    if (record.result) store.save(record);
    if (!record.result) {
      record.job.state = 'running';
      store.save(record);
      record.result = await operation({
        signal: controller.signal,
        async checkpoint(id) {
          record.job.provider_job_id = id;
          store.save(record);
          cancel();
        },
      });
      if (!record.result.images.length) throw new ImageError('NO_IMAGE', 'The provider returned no image outputs.');
      record.job.state = 'saving';
      store.save(record);
    }
    const result = record.result;
    for (let index = record.job.artifacts.length; index < result.images.length; index++) {
      const image = result.images[index];
      if (!image) throw new ImageError('NO_IMAGE', 'An image output is missing.');
      const artifact = await saveImage(image, record.job.output_directory, record.job.id, index, http);
      record.job.artifacts.push(artifact);
      store.save(record);
    }
    Object.assign(record.job, {
      state: 'completed', provider_request_id: result.request_id,
      version: result.version, routed_provider: result.routed_provider, usage: result.usage,
    });
    delete record.job.error;
    delete record.result;
    store.save(record);
  } catch (error) {
    record.job.error = publicError(error);
    const providerStillRecoverable = record.job.provider_job_id && !(error instanceof ImageError
      && ['CANCELLED', 'PREDICTION_FAILED'].includes(error.code));
    record.job.state = record.result ? 'saving'
      : error instanceof ImageError && error.code === 'CANCELLED' ? 'cancelled'
        : !providerStillRecoverable && error instanceof ImageError && !error.uncertain ? 'failed' : 'unknown';
    store.save(record);
  } finally {
    clearInterval(timer);
    if (cancelling) await cancelling;
    store.release(record);
  }
}
