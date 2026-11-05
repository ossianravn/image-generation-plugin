import { ImageError } from './errors.ts';

export type Fetch = typeof globalThis.fetch;

// Provider error bodies can echo prompts or credentials. Keep only short identifier-shaped
// fields (type, code, param, moderation stage and categories), never message text.
const token = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(value) ? value : undefined;

async function errorDetail(response: Response) {
  try {
    const { error } = await response.json() as { error?: Record<string, unknown> };
    if (!error || typeof error !== 'object') return {};
    const moderation = error.moderation_details as Record<string, unknown> | undefined;
    const categories = Array.isArray(moderation?.categories) ? moderation.categories.map(token).filter(Boolean) : [];
    return { type: token(error.type), code: token(error.code) ?? token(error.status), param: token(error.param),
      stage: token(moderation?.moderation_stage), categories: categories.join(', ') };
  } catch { return {}; }
}

function providerError(status: number, detail: Awaited<ReturnType<typeof errorDetail>>, paid: boolean): ImageError {
  if (detail.code === 'moderation_blocked') {
    const where = `${detail.stage ? ` at the ${detail.stage} stage` : ''}${detail.categories ? ` (${detail.categories})` : ''}`;
    return new ImageError('MODERATION_BLOCKED', `The provider's safety system blocked this request${where}. Change the prompt or images before trying again.`);
  }
  if (detail.type === 'image_generation_user_error') {
    return new ImageError('IMAGE_USER_ERROR', `The provider rejected the prompt or images${detail.code ? ` (${detail.code})` : ''}. Change them before trying again.`);
  }
  const action = status === 401 || status === 403 ? 'Check the API key and model access.'
    : status === 402 ? 'Check the provider account balance.'
      : status === 429 ? 'The provider rate limit or quota was reached.'
        : 'Check model availability and the requested image controls.';
  const hint = [detail.type, detail.code, detail.param && `param ${detail.param}`].filter(Boolean).join(', ');
  return new ImageError(`HTTP_${status}`, `Provider returned HTTP ${status}${hint ? ` (${hint})` : ''}. ${action}`,
    paid && (status >= 500 || status === 408), detail.param);
}

export class Http {
  private readonly fetcher: Fetch;

  constructor(fetcher: Fetch = globalThis.fetch) { this.fetcher = fetcher; }

  async json(url: string, init: RequestInit, paid = false): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, { ...init, redirect: 'error' });
    } catch {
      throw new ImageError('CONNECTION_LOST', paid
        ? 'The provider connection ended without a confirmed outcome. This request was not resubmitted.'
        : 'The provider could not be reached. Retry fetching the existing job.', paid);
    }
    if (!response.ok) throw providerError(response.status, await errorDetail(response), paid);
    try { return await response.json(); }
    catch { throw new ImageError('INVALID_RESPONSE', 'The provider returned an unreadable response.', paid); }
  }

  async download(url: string, signal?: AbortSignal): Promise<Buffer> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new ImageError('IMAGE_URL', 'The provider output URL must use HTTPS.');
    let response: Response;
    try { response = await this.fetcher(parsed, { signal }); }
    catch { throw new ImageError('DOWNLOAD_FAILED', 'The generated image could not be downloaded. Retry the existing job.'); }
    if (!response.ok) throw new ImageError('DOWNLOAD_FAILED', `Image download returned HTTP ${response.status}. Retry the existing job.`);
    return Buffer.from(await response.arrayBuffer());
  }
}

export function jsonBody(value: unknown): Pick<RequestInit, 'method' | 'body'> {
  return { method: 'POST', body: JSON.stringify(value) };
}
