import type { Case, ModelASR, ResultRow, TranscriptStep, ReportData, ConfigData } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || '';

export async function fetchHealth(): Promise<{ status: string; ollama_reachable: boolean }> {
  const res = await fetch(`${BASE_URL}/api/health`);
  return res.json();
}

export async function fetchCases(): Promise<Case[]> {
  const res = await fetch(`${BASE_URL}/api/cases`);
  return res.json();
}

export async function fetchCase(caseId: string): Promise<Case> {
  const res = await fetch(`${BASE_URL}/api/cases/${caseId}`);
  if (!res.ok) throw new Error('Case not found');
  return res.json();
}

export async function fetchResults(model?: string, defense?: string): Promise<ResultRow[]> {
  const params = new URLSearchParams();
  if (model) params.set('model', model);
  if (defense) params.set('defense', defense);
  const res = await fetch(`${BASE_URL}/api/results?${params}`);
  return res.json();
}

export async function fetchASR(): Promise<ModelASR[]> {
  const res = await fetch(`${BASE_URL}/api/asr`);
  return res.json();
}

export async function fetchTranscript(model: string, caseId: string, defense = 'none'): Promise<TranscriptStep[]> {
  const res = await fetch(`${BASE_URL}/api/transcript/${encodeURIComponent(model)}/${caseId}?defense=${defense}`);
  if (!res.ok) throw new Error('Transcript not found');
  return res.json();
}

export async function fetchReport(): Promise<ReportData> {
  const res = await fetch(`${BASE_URL}/api/report`);
  return res.json();
}

export async function fetchConfig(): Promise<ConfigData> {
  const res = await fetch(`${BASE_URL}/api/config`);
  return res.json();
}
