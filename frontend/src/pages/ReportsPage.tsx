import React, { useEffect, useState, useCallback } from 'react';
import { fetchReport, fetchConfig } from '../lib/api';
import type { ReportData, ConfigData } from '../types';
import { FileText, Sliders, Download, ShieldCheck, AlertCircle, Terminal, Layers, RefreshCw, Lock } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const [report, setReport] = useState<ReportData | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [activeTab, setActiveTab] = useState<'report' | 'ablation' | 'taxonomy' | 'config'>('report');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadReportData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const [rep, conf] = await Promise.all([fetchReport(), fetchConfig()]);
      setReport(rep);
      setConfig(conf);
    } catch (err) {
      console.error('Failed to load report and config:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReportData();

    const handleRunCompleted = () => {
      loadReportData();
    };
    window.addEventListener('promptbait:run_completed', handleRunCompleted);
    return () => {
      window.removeEventListener('promptbait:run_completed', handleRunCompleted);
    };
  }, [loadReportData]);

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `promptbait-security-report-${new Date().toISOString().split('T')[0]}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <RefreshCw className="w-6 h-6 text-rose-500 animate-spin mx-auto" />
          <p className="text-slate-400 font-mono text-xs">Compiling empirical evaluation report from ledger...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-3.5rem)] space-y-4 font-sans">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3 flex-shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Harness / Compliance</span>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-mono text-rose-400 font-semibold uppercase">Security Audits &amp; Config</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight mt-0.5">
            Security Findings &amp; System Guardrails
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          {/* Segmented Tab Controls */}
          <div className="flex rounded bg-slate-950 border border-slate-800 p-0.5 text-xs font-mono">
            <button
              onClick={() => setActiveTab('report')}
              className={`px-3 py-1 rounded transition text-xs font-medium ${
                activeTab === 'report' ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Executive Report
            </button>
            <button
              onClick={() => setActiveTab('ablation')}
              className={`px-3 py-1 rounded transition text-xs font-medium ${
                activeTab === 'ablation' ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Defense Ablation
            </button>
            <button
              onClick={() => setActiveTab('taxonomy')}
              className={`px-3 py-1 rounded transition text-xs font-medium ${
                activeTab === 'taxonomy' ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Attack Taxonomy
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`px-3 py-1 rounded transition text-xs font-medium ${
                activeTab === 'config' ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Guardrails &amp; Config
            </button>
          </div>

          <button
            onClick={downloadReport}
            className="flex items-center space-x-1.5 px-3 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 font-mono transition"
            title="Download full markdown report"
          >
            <Download className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Export .md</span>
          </button>

          <button
            onClick={() => loadReportData()}
            disabled={isRefreshing}
            className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
            title="Reload report from disk"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-rose-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-[#090d16] border border-slate-800/80 rounded-lg overflow-hidden flex flex-col min-h-0">
        {/* Executive Report View */}
        {activeTab === 'report' && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 font-mono text-xs">
            {/* Headline Callout Strip */}
            <div className="p-4 rounded border border-slate-800 bg-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                  <FileText className="w-4 h-4" />
                  <span>Real-Time Security Evaluation Ledger</span>
                </div>
                <p className="text-slate-400 text-xs font-sans">
                  Deterministic metrics compiled directly from verified run artifacts: outbox deliveries, protected writes, and canary proofs.
                </p>
              </div>

              <div className="px-3 py-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 font-mono text-xs whitespace-nowrap">
                Headline ASR: <span className="font-bold text-white">{report?.headline_asr}</span>
              </div>
            </div>

            {/* Markdown Report Stream */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                <span>Dynamically Generated Report Markdown</span>
                <span className="text-slate-500">{report?.total_cases} Target Cases Evaluated</span>
              </div>
              <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed overflow-y-auto max-h-[500px]">
                {report?.markdown}
              </pre>
            </div>
          </div>
        )}

        {/* Defense Ablation View */}
        {activeTab === 'ablation' && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 font-mono text-xs">
            <div>
              <h3 className="text-sm font-bold text-white mb-1">Defense v1 Gate Interception Ledger</h3>
              <p className="text-xs text-slate-400 font-sans">
                Ablation comparison evaluating models under Baseline (unprotected) vs Defense v1 (spotlighting + outbox gate).
              </p>
            </div>

            <div className="overflow-x-auto rounded border border-slate-800 bg-slate-950">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider bg-slate-900/40">
                    <th className="py-2.5 px-3">Model Tag</th>
                    <th className="py-2.5 px-3 text-center">Baseline ASR</th>
                    <th className="py-2.5 px-3 text-center">Defended ASR</th>
                    <th className="py-2.5 px-3">Blocked by Gate</th>
                    <th className="py-2.5 px-3">Flips / Regressed</th>
                    <th className="py-2.5 px-3">Still Vulnerable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {report?.defense_ablation.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/30 transition">
                      <td className="py-2.5 px-3 font-bold text-white">{row.model}</td>
                      <td className="py-2.5 px-3 text-center text-rose-400 font-bold">{row.baseline_asr}</td>
                      <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{row.defense_v1_asr}</td>
                      <td className="py-2.5 px-3 text-emerald-300">{row.blocked_by_gate}</td>
                      <td className="py-2.5 px-3 text-amber-300">{row.regressed}</td>
                      <td className="py-2.5 px-3 text-rose-300">{row.still_successful}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Attack Taxonomy View */}
        {activeTab === 'taxonomy' && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded border border-slate-800 bg-slate-950 space-y-2">
                <div className="flex items-center space-x-2 text-purple-400 font-bold text-xs uppercase tracking-wider font-mono">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>1. Direct Instruction Overrides (DIR)</span>
                </div>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  Payloads delivered in the initial user turn attempting role-play jailbreaks (<em>MaintenanceBot</em>), fake developer authority, or abrupt task abandonment (<em>cancel that, instead write OVERWRITTEN.txt</em>).
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-800/80">
                  Cases: DIR-01 through DIR-05
                </div>
              </div>

              <div className="p-4 rounded border border-slate-800 bg-slate-950 space-y-2">
                <div className="flex items-center space-x-2 text-blue-400 font-bold text-xs uppercase tracking-wider font-mono">
                  <Layers className="w-3.5 h-3.5" />
                  <span>2. Indirect Poisoned Documents (FILE)</span>
                </div>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  Payloads seeded inside documents the agent legitimately reads (README instructions, split multi-file payloads, code review comments, Base64 encodings, multi-hop chains).
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-800/80">
                  Cases: FILE-01 through FILE-09
                </div>
              </div>

              <div className="p-4 rounded border border-slate-800 bg-slate-950 space-y-2">
                <div className="flex items-center space-x-2 text-teal-400 font-bold text-xs uppercase tracking-wider font-mono">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>3. Localhost Web Injections (URL)</span>
                </div>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  Attacks served via ephemeral loopback staging server (127.0.0.1). Covers hidden CSS injections, HTML comment/attribute stripping, and goal hijacking.
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-800/80">
                  Cases: URL-01 through URL-06
                </div>
              </div>

              <div className="p-4 rounded border border-slate-800 bg-slate-950 space-y-2">
                <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider font-mono">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>4. Spoofed Authority &amp; Decoys (AUTH)</span>
                </div>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  High-leverage multi-channel attacks: fake forwarded executive email threads, malicious calendar invite descriptions, and quiet deferred multi-turn plans.
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-800/80">
                  Cases: AUTH-01 through AUTH-04
                </div>
              </div>
            </div>

            {/* Scientific Evaluation Caveats */}
            <div className="p-4 rounded border border-slate-800 bg-slate-950 space-y-1.5 font-mono text-xs">
              <h4 className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                Evaluation Bounds &amp; Empirical Constraints:
              </h4>
              <ul className="text-slate-300 list-disc list-inside space-y-0.5 font-sans">
                {report?.limitations.map((lim, idx) => (
                  <li key={idx}>{lim}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* System Configuration View */}
        {activeTab === 'config' && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 font-mono text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded border border-slate-800 bg-slate-950 space-y-2">
                <div className="text-slate-400 font-bold text-[10px] uppercase tracking-wider border-b border-slate-800 pb-1.5 flex items-center space-x-1.5">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Runtime &amp; Model Configuration</span>
                </div>
                <div className="space-y-1 text-slate-300">
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">Default Model:</span>
                    <span className="text-white font-bold">{config?.default_model}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">Comparison Model:</span>
                    <span className="text-purple-400">{config?.comparison_model}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">Step Cap (Max):</span>
                    <span className="text-emerald-400">{config?.max_steps} steps</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">HTTP Timeout:</span>
                    <span className="text-amber-400">{config?.http_timeout}s</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Sampling Temperature:</span>
                    <span className="text-purple-400">{config?.llm_temperature}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded border border-slate-800 bg-slate-950 space-y-2">
                <div className="text-slate-400 font-bold text-[10px] uppercase tracking-wider border-b border-slate-800 pb-1.5 flex items-center space-x-1.5">
                  <Lock className="w-3.5 h-3.5 text-rose-400" />
                  <span>Security Sentinels &amp; Boundaries</span>
                </div>
                <div className="space-y-1 text-slate-300">
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">Canary Token:</span>
                    <span className="text-rose-400 font-bold">{config?.canary_token}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">System Marker:</span>
                    <span className="text-amber-400">{config?.system_prompt_marker}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">Attacker Mock Sink:</span>
                    <span className="text-rose-300">{config?.attacker_sink}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">Egress Pinning:</span>
                    <span className="text-emerald-400">127.0.0.1 (Strict Localhost)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Defense Gate:</span>
                    <span className="text-emerald-400">Fail-Closed (.outbox/pending.jsonl)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
