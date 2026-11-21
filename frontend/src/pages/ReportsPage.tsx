import React, { useEffect, useState } from 'react';
import { fetchReport, fetchConfig } from '../lib/api';
import type { ReportData, ConfigData } from '../types';
import { FileText, Sliders, Download, ShieldCheck, AlertCircle, Terminal, Layers, Info } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const [report, setReport] = useState<ReportData | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [activeTab, setActiveTab] = useState<'report' | 'config' | 'taxonomy'>('report');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchReport(), fetchConfig()])
      .then(([rep, conf]) => {
        setReport(rep);
        setConfig(conf);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'promptbait-redteam-report.md';
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="p-8 text-slate-400 font-mono">Loading reports and configurations...</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Security Reports & System Configurations</h2>
          <p className="text-sm text-slate-400 mt-1">
            Empirical attack success audits, defense ablation metrics, failure taxonomies, and execution boundaries.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-1 text-xs font-mono">
            <button
              onClick={() => setActiveTab('report')}
              className={`px-3.5 py-1.5 rounded-md font-medium transition ${
                activeTab === 'report' ? 'bg-rose-500/20 text-rose-300 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Published Report
            </button>
            <button
              onClick={() => setActiveTab('taxonomy')}
              className={`px-3.5 py-1.5 rounded-md font-medium transition ${
                activeTab === 'taxonomy' ? 'bg-rose-500/20 text-rose-300 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Failure Taxonomy
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`px-3.5 py-1.5 rounded-md font-medium transition ${
                activeTab === 'config' ? 'bg-rose-500/20 text-rose-300 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              System Configs
            </button>
          </div>

          <button
            onClick={downloadReport}
            className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 font-mono font-medium flex items-center space-x-2 transition"
          >
            <Download className="w-3.5 h-3.5 text-rose-400" />
            <span>Export report.md</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
        {activeTab === 'report' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-6 font-sans">
            {/* Headline Callout Banner */}
            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <FileText className="w-5 h-5 text-rose-500" />
                  <h3 className="font-bold text-white text-base">Executive Red-Team Evaluation Summary</h3>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  Headline ASR: {report?.headline_asr}
                </span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                PromptBait measures indirect prompt injection and unauthorized privilege escalation across small local models.
                All reported metrics originate exclusively from deterministic forensic evidence: secret egress via mock email sinks,
                state-changing writes to protected directories, and canary token discovery.
              </p>
            </div>

            {/* Defense Ablation Breakdown */}
            <div className="space-y-3">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Defense v1 Ablation Matrix (Instruction Hierarchy + Spotlighting + Email Gate)</span>
              </h4>

              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/50">
                      <th className="py-2.5 px-4">Model</th>
                      <th className="py-2.5 px-4 text-center">Baseline ASR</th>
                      <th className="py-2.5 px-4 text-center">Defended ASR</th>
                      <th className="py-2.5 px-4">Blocked by Gate</th>
                      <th className="py-2.5 px-4">Incidental Flips / Regressed</th>
                      <th className="py-2.5 px-4">Still Vulnerable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {report?.defense_ablation.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/30">
                        <td className="py-2.5 px-4 font-bold text-white">{row.model}</td>
                        <td className="py-2.5 px-4 text-center text-rose-400 font-bold">{row.baseline_asr}</td>
                        <td className="py-2.5 px-4 text-center text-emerald-400 font-bold">{row.defense_v1_asr}</td>
                        <td className="py-2.5 px-4 text-emerald-300">{row.blocked_by_gate}</td>
                        <td className="py-2.5 px-4 text-amber-300">{row.regressed}</td>
                        <td className="py-2.5 px-4 text-rose-300">{row.still_successful}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Verbatim Report Preview */}
            <div className="space-y-2">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
                Raw Markdown Report Stream
              </h4>
              <pre className="p-5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                {report?.markdown}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'taxonomy' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center space-x-2 text-purple-400 font-bold text-sm">
                  <Terminal className="w-4 h-4" />
                  <span>1. Direct Instruction Overrides (DIR)</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Payloads delivered in the initial user turn attempting role-play jailbreaks (*MaintenanceBot*), fake developer authority, or abrupt task abandonment (*cancel that, instead write OVERWRITTEN.txt*). Measures if the model prioritizes user text over system safety rules.
                </p>
                <div className="text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-800/80">
                  Targeted Cases: DIR-01 through DIR-05
                </div>
              </div>

              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center space-x-2 text-blue-400 font-bold text-sm">
                  <Layers className="w-4 h-4" />
                  <span>2. Indirect Poisoned Documents (FILE)</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Payloads seeded inside documents the agent legitimately reads (README instructions, split multi-file payloads, Python code comments under review, Base64 encodings, multi-hop chains). Realistic enterprise threat scenario.
                </p>
                <div className="text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-800/80">
                  Targeted Cases: FILE-01 through FILE-09
                </div>
              </div>

              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center space-x-2 text-teal-400 font-bold text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>3. Localhost Web Injections (URL)</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Attacks served via ephemeral loopback staging server. Covers hidden CSS injections, HTML comment/attribute stripping (sanitization control), goal hijacking, and task-conditional triggers. Egress is strictly pinned to prevent external SSRF.
                </p>
                <div className="text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-800/80">
                  Targeted Cases: URL-01 through URL-06
                </div>
              </div>

              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  <span>4. Spoofed Authority & Decoys (AUTH)</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  High-leverage multi-channel attacks: fake forwarded email threads from leadership, malicious calendar invite `.ics` descriptions, decoy documents, and quiet deferred multi-turn plans that execute exfiltration after secondary tool calls.
                </p>
                <div className="text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-800/80">
                  Targeted Cases: AUTH-01 through AUTH-04
                </div>
              </div>
            </div>

            {/* Scientific Limitations Card */}
            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <h4 className="text-xs font-mono uppercase text-slate-400 font-bold flex items-center space-x-2">
                <Info className="w-4 h-4 text-rose-400" />
                <span>Empirical Evaluation Caveats & Limitations</span>
              </h4>
              <ul className="text-xs text-slate-300 list-disc list-inside space-y-1">
                {report?.limitations.map((lim, idx) => (
                  <li key={idx}>{lim}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-6 font-mono text-xs">
            <div className="flex items-center space-x-2 text-sm font-bold text-white mb-2">
              <Sliders className="w-4 h-4 text-rose-500" />
              <span>Core Red-Team Harness & Sandboxing Parameters</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-2">
                  Inference & Runtime Settings
                </div>
                <div className="space-y-2 text-slate-300">
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">Default Model:</span>
                    <span className="text-white font-bold">{config?.default_model}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">Ollama Host:</span>
                    <span className="text-slate-300">{config?.ollama_host}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">Max Steps Per Turn:</span>
                    <span className="text-emerald-400">{config?.max_steps}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">HTTP Timeout:</span>
                    <span className="text-slate-300">{config?.http_timeout}s</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Sampling Temperature:</span>
                    <span className="text-purple-400">{config?.llm_temperature}</span>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-2">
                  Security Guardrails & Sentinels
                </div>
                <div className="space-y-2 text-slate-300">
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">Canary Token:</span>
                    <span className="text-rose-400 font-bold">{config?.canary_token}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">System Prompt Marker:</span>
                    <span className="text-amber-400">{config?.system_prompt_marker}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">Attacker Mock Sink:</span>
                    <span className="text-rose-300">{config?.attacker_sink}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-500">Egress Allow-List:</span>
                    <span className="text-emerald-400">127.0.0.1, localhost</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Defense v1 Gate:</span>
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
