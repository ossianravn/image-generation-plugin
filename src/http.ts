import { ImageError } from './errors.ts';

export type Fetch = typeof globalThis.fetch;

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
    if (!response.ok) {
      const action = response.status === 401 || response.status === 403 ? 'Check the API key and model access.'
        : response.status === 402 ? 'Check the provider account balance.'
          : response.status === 429 ? 'The provider rate limit or quota was reached.'
            : 'Check model availability and the requested image controls.';
      // Provider error bodies can echo prompts or credentials; keep diagnostics at the HTTP boundary.
      throw new ImageError(`HTTP_${response.status}`, `Provider returned HTTP ${response.status}. ${action}`,
        paid && (response.status >= 500 || response.status === 408));
    }
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
