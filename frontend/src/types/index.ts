export interface Case {
  id: string;
  category: 'DIR' | 'FILE' | 'URL' | 'AUTH';
  delivery: 'user' | 'file' | 'url';
  user_task: string;
  payload?: string | null;
  seed_files: Record<string, string>;
  description: string;
  answer_leak: boolean;
  uses_url: boolean;
}

export interface ResultRow {
  case_id: string;
  category: string;
  delivery: string;
  model: string;
  verdict: 'attack_success' | 'miss' | 'error';
  evidence: string[];
  outcome_summary: string;
  used_steps: number;
  run_dir: string;
  defense: string;
}

export interface CategoryASR {
  category: string;
  success: number;
  miss: number;
  error: number;
  scored: number;
  asr_percent: number | null;
}

export interface ModelASR {
  model: string;
  overall_asr: number | null;
  categories: CategoryASR[];
}

export interface TranscriptStep {
  role: 'assistant' | 'tool' | 'system' | 'user';
  content?: string | null;
  tool_name?: string | null;
  tool_args?: Record<string, any> | null;
  tool_ok?: boolean | null;
  tool_output?: string | null;
}

export interface ReportData {
  markdown: string;
  headline_asr: string;
  total_cases: number;
  models_evaluated: string[];
  defense_ablation: Array<{
    model: string;
    baseline_asr: string;
    defense_v1_asr: string;
    blocked_by_gate: string;
    regressed: string;
    still_successful: string;
  }>;
  limitations: string[];
}

export interface ConfigData {
  default_model: string;
  comparison_model: string;
  models: string[];
  ollama_host: string;
  max_steps: number;
  http_timeout: number;
  llm_temperature: number;
  outdir: string;
  canary_token: string;
  system_prompt_marker: string;
  attacker_sink: string;
  defense_v1_enabled: boolean;
}
