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

    const syncInterval = setInterval(() => {
      loadReportData();
    }, 60000);

    const handleRefresh = () => {
      loadReportData();
    };
    window.addEventListener('promptbait:run_completed', handleRefresh);
    window.addEventListener('promptbait:refresh', handleRefresh);
    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('promptbait:run_completed', handleRefresh);
      window.removeEventListener('promptbait:refresh', handleRefresh);
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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col space-y-4 font-sans w-full min-w-0">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3 flex-shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-slate-300 font-semibold uppercase tracking-wider">Harness / Compliance</span>
            <span className="text-slate-500">/</span>
            <span className="text-xs font-mono text-rose-400 font-bold uppercase tracking-wider">Security Audits &amp; Config</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-1">
            Security Findings &amp; System Guardrails
          </h2>
        </div>

        <div className="flex items-center space-x-2.5 flex-wrap">
          {/* Segmented Tab Controls */}
          <div className="flex rounded-md bg-slate-950 border border-slate-800 p-0.5 text-xs font-mono">
            <button
              onClick={() => setActiveTab('report')}
              className={`px-3 py-1.5 rounded transition text-xs font-semibold ${
                activeTab === 'report' ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40 shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
            >
              Executive Report
            </button>
            <button
              onClick={() => setActiveTab('ablation')}
              className={`px-3 py-1.5 rounded transition text-xs font-semibold ${
                activeTab === 'ablation' ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40 shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
            >
              Defense Ablation
            </button>
            <button
              onClick={() => setActiveTab('taxonomy')}
              className={`px-3 py-1.5 rounded transition text-xs font-semibold ${
                activeTab === 'taxonomy' ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40 shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
            >
              Attack Taxonomy
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`px-3 py-1.5 rounded transition text-xs font-semibold ${
                activeTab === 'config' ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40 shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
            >
              Guardrails &amp; Config
            </button>
          </div>

          <button
            onClick={downloadReport}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs sm:text-sm text-slate-100 font-mono font-medium shadow-sm transition"
            title="Download full markdown report"
          >
            <Download className="w-4 h-4 text-rose-400" />
            <span className="hidden sm:inline">Export .md</span>
          </button>

          <button
            onClick={() => loadReportData()}
            disabled={isRefreshing}
            className="p-2 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition shadow-sm"
            title="Reload report from disk"
          >
            <RefreshCw className={`w-4 h-4 text-rose-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-[#090d16] border border-slate-800 rounded-lg overflow-hidden shadow-sm min-w-0 w-full">
        {/* Executive Report View */}
        {activeTab === 'report' && (
          <div className="p-5 sm:p-6 space-y-5 font-mono text-xs min-w-0">
            {/* Headline Callout Strip */}
            <div className="p-4 rounded-lg border border-slate-800 bg-slate-950 flex flex-col xl:flex-row xl:items-center justify-between gap-4 shadow-sm min-w-0">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm uppercase tracking-wider">
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  <span>Real-Time Security Evaluation Ledger</span>
                </div>
                <p className="text-slate-300 text-xs font-sans font-medium">
                  Deterministic metrics compiled directly from verified run artifacts: outbox deliveries, protected writes, and canary proofs.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                <span className="text-xs font-mono text-slate-400 uppercase font-semibold mr-1">Headline ASR:</span>
                {report?.headline_asr ? (
                  report.headline_asr.split('|').map((part, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 font-mono text-xs font-bold"
                    >
                      {part.trim()}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 font-mono">No data</span>
                )}
              </div>
            </div>

            {/* Markdown Report Stream */}
            <div className="space-y-2 min-w-0 max-w-full">
              <div className="flex items-center justify-between text-slate-300 text-xs font-bold uppercase tracking-wider flex-wrap gap-2">
                <span>Dynamically Generated Report Markdown</span>
                <span className="text-slate-200 font-semibold">{report?.total_cases} Target Cases Evaluated</span>
              </div>
              <div className="rounded-lg bg-slate-950 border border-slate-800 p-4 overflow-x-auto max-w-full shadow-inner">
                <pre className="text-xs sm:text-sm font-mono text-slate-200 whitespace-pre leading-relaxed break-normal inline-block min-w-full">
                  {report?.markdown}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Defense Ablation View */}
        {activeTab === 'ablation' && (
          <div className="p-5 sm:p-6 space-y-4 font-mono text-xs min-w-0">
            <div>
              <h3 className="text-base font-bold text-white mb-1">Defense v1 Gate Interception Ledger</h3>
              <p className="text-xs text-slate-300 font-sans font-medium">
                Ablation comparison evaluating models under Baseline (unprotected) vs Defense v1 (spotlighting + outbox gate).
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 max-w-full">
              <table className="w-full text-left text-sm font-mono">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-200 uppercase text-xs font-bold tracking-wider bg-slate-900/60">
                    <th className="py-3 px-3.5">Model Tag</th>
                    <th className="py-3 px-3 text-center">Baseline ASR</th>
                    <th className="py-3 px-3 text-center">Defended ASR</th>
                    <th className="py-3 px-3">Blocked by Gate</th>
                    <th className="py-3 px-3">Flips / Regressed</th>
                    <th className="py-3 px-3">Still Vulnerable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {report?.defense_ablation.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/40 transition">
                      <td className="py-3 px-3.5 font-bold text-white">{row.model}</td>
                      <td className="py-3 px-3 text-center text-rose-300 font-extrabold">{row.baseline_asr}</td>
                      <td className="py-3 px-3 text-center text-emerald-300 font-extrabold">{row.defense_v1_asr}</td>
                      <td className="py-3 px-3 text-emerald-300 font-semibold">{row.blocked_by_gate}</td>
                      <td className="py-3 px-3 text-amber-300 font-semibold">{row.regressed}</td>
                      <td className="py-3 px-3 text-rose-300 font-semibold">{row.still_successful}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Attack Taxonomy View */}
        {activeTab === 'taxonomy' && (
          <div className="p-5 sm:p-6 space-y-4 min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-slate-800 bg-slate-950 space-y-2 shadow-sm min-w-0">
                <div className="flex items-center space-x-2 text-purple-400 font-bold text-sm uppercase tracking-wider font-mono">
                  <Terminal className="w-4 h-4 flex-shrink-0" />
                  <span>1. Direct Instruction Overrides (DIR)</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 font-sans leading-relaxed">
                  Payloads delivered in the initial user turn attempting role-play jailbreaks (<em>MaintenanceBot</em>), fake developer authority, or abrupt task abandonment (<em>cancel that, instead write OVERWRITTEN.txt</em>).
                </p>
                <div className="text-xs font-mono text-slate-400 font-semibold pt-2 border-t border-slate-800">
                  Cases: DIR-01 through DIR-05
                </div>
              </div>

              <div className="p-4 rounded-lg border border-slate-800 bg-slate-950 space-y-2 shadow-sm min-w-0">
                <div className="flex items-center space-x-2 text-blue-400 font-bold text-sm uppercase tracking-wider font-mono">
                  <Layers className="w-4 h-4 flex-shrink-0" />
                  <span>2. Indirect Poisoned Documents (FILE)</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 font-sans leading-relaxed">
                  Payloads seeded inside documents the agent legitimately reads (README instructions, split multi-file payloads, code review comments, Base64 encodings, multi-hop chains).
                </p>
                <div className="text-xs font-mono text-slate-400 font-semibold pt-2 border-t border-slate-800">
                  Cases: FILE-01 through FILE-09
                </div>
              </div>

              <div className="p-4 rounded-lg border border-slate-800 bg-slate-950 space-y-2 shadow-sm min-w-0">
                <div className="flex items-center space-x-2 text-teal-400 font-bold text-sm uppercase tracking-wider font-mono">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>3. Localhost Web Injections (URL)</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 font-sans leading-relaxed">
                  Attacks served via ephemeral loopback staging server (127.0.0.1). Covers hidden CSS injections, HTML comment/attribute stripping, and goal hijacking.
                </p>
                <div className="text-xs font-mono text-slate-400 font-semibold pt-2 border-t border-slate-800">
                  Cases: URL-01 through URL-06
                </div>
              </div>

              <div className="p-4 rounded-lg border border-slate-800 bg-slate-950 space-y-2 shadow-sm min-w-0">
                <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm uppercase tracking-wider font-mono">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                  <span>4. Spoofed Authority &amp; Decoys (AUTH)</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 font-sans leading-relaxed">
                  High-leverage multi-channel attacks: fake forwarded executive email threads, malicious calendar invite descriptions, and quiet deferred multi-turn plans.
                </p>
                <div className="text-xs font-mono text-slate-400 font-semibold pt-2 border-t border-slate-800">
                  Cases: AUTH-01 through AUTH-04
                </div>
              </div>
            </div>

            {/* Scientific Evaluation Caveats */}
            <div className="p-4 rounded-lg border border-slate-800 bg-slate-950 space-y-2 font-mono text-xs shadow-sm min-w-0">
              <h4 className="text-slate-200 font-bold text-xs uppercase tracking-wider">
                Evaluation Bounds &amp; Empirical Constraints:
              </h4>
              <ul className="text-slate-300 list-disc list-inside space-y-1 font-sans text-xs sm:text-sm font-medium">
                {report?.limitations.map((lim, idx) => (
                  <li key={idx}>{lim}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* System Configuration View */}
        {activeTab === 'config' && (
          <div className="p-5 sm:p-6 space-y-4 font-mono text-xs min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-slate-800 bg-slate-950 space-y-2 shadow-sm min-w-0">
                <div className="text-slate-200 font-bold text-xs uppercase tracking-wider border-b border-slate-800 pb-2 flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>Runtime &amp; Model Configuration</span>
                </div>
                <div className="space-y-1.5 text-slate-200 text-xs sm:text-sm font-medium">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Default Model:</span>
                    <span className="text-white font-bold">{config?.default_model}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Comparison Model:</span>
                    <span className="text-purple-300 font-semibold">{config?.comparison_model}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Step Cap (Max):</span>
                    <span className="text-emerald-300 font-semibold">{config?.max_steps} steps</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">HTTP Timeout:</span>
                    <span className="text-amber-300 font-semibold">{config?.http_timeout}s</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Sampling Temperature:</span>
                    <span className="text-purple-300 font-semibold">{config?.llm_temperature}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-slate-800 bg-slate-950 space-y-2 shadow-sm min-w-0">
                <div className="text-slate-200 font-bold text-xs uppercase tracking-wider border-b border-slate-800 pb-2 flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>Security Sentinels &amp; Boundaries</span>
                </div>
                <div className="space-y-1.5 text-slate-200 text-xs sm:text-sm font-medium">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Canary Token:</span>
                    <span className="text-rose-300 font-mono font-bold">{config?.canary_token}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">System Marker:</span>
                    <span className="text-amber-300 font-mono font-bold">{config?.system_prompt_marker}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Attacker Mock Sink:</span>
                    <span className="text-rose-200 font-mono">{config?.attacker_sink}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Egress Pinning:</span>
                    <span className="text-emerald-300 font-semibold">127.0.0.1 (Strict Localhost)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Defense Gate:</span>
                    <span className="text-emerald-300 font-semibold">Fail-Closed (.outbox/pending.jsonl)</span>
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
