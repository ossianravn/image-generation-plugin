export function numericUsage(raw: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const entries: [string, unknown][] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') entries.push([key, value]);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = numericUsage(value as Record<string, unknown>);
      if (nested && Object.keys(nested).length) entries.push([key, nested]);
    }
  }
  return Object.fromEntries(entries);
}
