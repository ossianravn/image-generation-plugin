export type Provider = 'openai' | 'gemini' | 'replicate' | 'openrouter';
export type Operation = 'generate' | 'edit';

export interface ImageOptions {
  size?: string;
  aspect_ratio?: string;
  resolution?: string;
  quality?: 'auto' | 'low' | 'medium' | 'high';
  background?: 'auto' | 'opaque' | 'transparent';
  output_format?: 'png' | 'jpeg' | 'webp';
  output_compression?: number;
  seed?: number;
  grounding?: boolean;
}

export interface ImageRequest {
  request_id: string;
  provider: Provider;
  model: string;
  prompt: string;
  output_directory: string;
  references: string[];
  mask?: string;
  count: number;
  options: ImageOptions;
}

export interface InputImage {
  path: string;
  bytes: Buffer;
  mime: string;
  width: number;
  height: number;
}

export interface PreparedRequest {
  request: ImageRequest;
  operation: Operation;
  references: InputImage[];
  mask?: InputImage;
}

export type ImageOutput = { base64: string } | { url: string };

export interface ProviderResult {
  images: ImageOutput[];
  request_id?: string;
  version?: string;
  routed_provider?: string;
  usage?: Record<string, unknown>;
}

export interface ProviderContext {
  signal: AbortSignal;
  checkpoint: (providerJobId: string) => Promise<void>;
}

export interface ProviderAdapter {
  submit(input: PreparedRequest, context: ProviderContext): Promise<ProviderResult>;
  recover?(providerJobId: string, context: ProviderContext): Promise<ProviderResult>;
  cancel?(providerJobId: string): Promise<void>;
}

export interface Artifact {
  id: string;
  path: string;
  mime_type: string;
  width: number;
  height: number;
  sha256: string;
}

export type JobState = 'submitted' | 'running' | 'saving' | 'completed'
  | 'failed' | 'cancel_requested' | 'cancelled' | 'unknown';

export interface Job {
  id: string;
  provider: Provider;
  model: string;
  operation: Operation;
  state: JobState;
  created_at: string;
  updated_at: string;
  output_directory: string;
  artifacts: Artifact[];
  provider_job_id?: string;
  provider_request_id?: string;
  version?: string;
  routed_provider?: string;
  usage?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface StoredJob {
  job: Job;
  fingerprint: string;
  owner: string;
  owner_pid: number;
  result?: ProviderResult;
}

export interface ModelDescriptor {
  provider: Provider;
  id: string;
  name: string;
  api: 'images' | 'interactions' | 'predictions';
  max_references: number | null;
  max_count: number;
  controls: (keyof ImageOptions)[];
  masks: boolean;
  evidence: 'documented';
  source: string;
  checked_at: string;
  live_validation?: {
    checked_at: string;
    plugin_version: string;
    completed_workflows: string[];
    references_tested: number;
  };
}
