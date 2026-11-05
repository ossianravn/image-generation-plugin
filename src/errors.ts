export class ImageError extends Error {
  readonly code: string;
  readonly uncertain: boolean;
  /** The request parameter a provider named in its error, when it named one. */
  readonly param?: string;

  constructor(code: string, message: string, uncertain = false, param?: string) {
    super(message);
    this.name = 'ImageError';
    this.code = code;
    this.uncertain = uncertain;
    if (param) this.param = param;
  }
}

export function publicError(error: unknown): { code: string; message: string } {
  if (error instanceof ImageError) return { code: error.code, message: error.message };
  return { code: 'INTERNAL_ERROR', message: 'The operation could not finish. Inspect the job state before submitting again.' };
}

export function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
