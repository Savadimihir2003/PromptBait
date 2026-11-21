import React, { useEffect, useState, useCallback } from 'react';
import { fetchASR, fetchResults } from '../lib/api';
import type { ModelASR, ResultRow, CategoryASR } from '../types';
import { ShieldCheck, AlertTriangle, Bug, Activity, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export const DashboardPage: React.FC = () => {
  const [asrData, setAsrData] = useState<ModelASR[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Initializing...');

  const loadMetrics = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const [asr, res] = await Promise.all([fetchASR(), fetchResults()]);
      setAsrData(asr);
      setResults(res);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to load evaluation metrics:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();

    // Auto-refresh metrics whenever any run finishes in Runner
    const handleRunCompleted = () => {
      loadMetrics();
    };
    window.addEventListener('promptbait:run_completed', handleRunCompleted);
    return () => {
      window.removeEventListener('promptbait:run_completed', handleRunCompleted);
    };
  }, [loadMetrics]);

  // Dynamic computations from actual data
  const baselineResults = results.filter(r => r.defense === 'none');
  const totalEvaluated = results.length;
  const successes = results.filter(r => r.verdict === 'attack_success').length;
  const misses = results.filter(r => r.verdict === 'miss').length;
  const errors = results.filter(r => r.verdict === 'error').length;

  // Highest ASR across all models (baseline only)
  const highestASR = asrData.reduce((max, m) =>
    (m.overall_asr !== null && m.overall_asr > max) ? m.overall_asr : max, 0);
  const highestASRModel = asrData.find(m => m.overall_asr === highestASR)?.model || 'None';

  // Defense delta
  const defenseResults = results.filter(r => r.defense !== 'none');
  const defenseSuccesses = defenseResults.filter(r => r.verdict === 'attack_success').length;
  const defenseTotal = defenseResults.filter(r => ['attack_success', 'miss'].includes(r.verdict)).length;
  const defenseASR = defenseTotal > 0 ? Math.round(100 * defenseSuccesses / defenseTotal) : null;

  const donutData = [
    { name: 'Attack Succeeded (PWNED)', value: successes, color: '#f43f5e' },
    { name: 'Resisted (Safe)', value: misses, color: '#10b981' },
    { name: 'Execution Error', value: errors, color: '#f59e0b' },
  ].filter(d => d.value > 0);

  // Bar chart data: per-model overall ASR
  const barData = asrData
    .filter(m => m.overall_asr !== null)
    .map(m => {
      const shortName = m.model.replace('gq/', '').split('/').pop() || m.model;
      return {
        model: shortName,
        fullModel: m.model,
        asr: m.overall_asr ?? 0,
      };
    });

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="w-7 h-7 rounded-full border-2 border-rose-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-slate-400 font-mono text-xs">Querying evaluation ledger &amp; computing ASR matrix...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto font-sans">
      {/* Top Console Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Harness / Analytics</span>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-mono text-rose-400 font-semibold uppercase">Security Overview</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight mt-0.5">
            Empirical Evaluation Dashboard
          </h2>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] font-mono text-slate-500 block uppercase">Last Synchronized</span>
            <span className="text-xs font-mono text-slate-300">{lastSyncTime}</span>
          </div>

          <button
            onClick={() => loadMetrics()}
            disabled={isRefreshing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 font-mono transition"
            title="Reload latest results.jsonl from disk"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-rose-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800/80 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono uppercase tracking-wider">
            <span>Evaluated Runs</span>
            <Activity className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono tracking-tight">{totalEvaluated}</div>
          <div className="text-[11px] text-slate-400 font-mono">
            {baselineResults.length} baseline · {defenseResults.length} defended
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800/80 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono uppercase tracking-wider">
            <span>Peak ASR (Vulnerability)</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-400 font-mono tracking-tight">
            {highestASR > 0 ? `${highestASR}%` : '0%'}
          </div>
          <div className="text-[11px] text-rose-400/80 truncate font-mono" title={highestASRModel}>
            Target: {highestASRModel}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800/80 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono uppercase tracking-wider">
            <span>Defense v1 Rate</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 font-mono tracking-tight">
            {defenseASR !== null ? `${defenseASR}%` : '—'}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {defenseASR !== null && highestASR > 0
              ? `${Math.abs(highestASR - defenseASR)}pp mitigation delta`
              : 'Hierarchy + Outbox Gate'}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800/80 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono uppercase tracking-wider">
            <span>Judge Verification</span>
            <Bug className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-lg font-bold text-white font-mono tracking-tight pt-0.5">Deterministic</div>
          <div className="text-[11px] text-slate-400 font-mono">Canary Tokens · Zero LLM Vibes</div>
        </div>
      </div>

      {/* Main Grid: ASR Matrix Table (Left) + Charts (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ASR Matrix Table */}
        <div className="xl:col-span-2 p-4 sm:p-5 rounded-lg bg-slate-900/90 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-white">ASR Matrix by Delivery Category</h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Evaluated percentage and raw successful exploit counts
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
              {asrData.length} Models Recorded
            </span>
          </div>

          {asrData.length === 0 ? (
            <div className="py-12 text-center text-slate-600 font-mono text-xs">
              No evaluation rows found in results/ or runs/ directories.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Model &amp; Weights</th>
                    <th className="py-2.5 px-2 text-center">DIR (5)</th>
                    <th className="py-2.5 px-2 text-center">FILE (9)</th>
                    <th className="py-2.5 px-2 text-center">URL (6)</th>
                    <th className="py-2.5 px-2 text-center">AUTH (4)</th>
                    <th className="py-2.5 px-3 text-center">Overall ASR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 font-mono">
                  {asrData.map((m) => {
                    const dir = m.categories.find((c: CategoryASR) => c.category === 'DIR');
                    const file = m.categories.find((c: CategoryASR) => c.category === 'FILE');
                    const url = m.categories.find((c: CategoryASR) => c.category === 'URL');
                    const auth = m.categories.find((c: CategoryASR) => c.category === 'AUTH');

                    const renderCell = (cat?: CategoryASR) => {
                      if (!cat || cat.scored === 0) {
                        return <span className="text-slate-700 font-mono">—</span>;
                      }
                      const asr = cat.asr_percent ?? 0;
                      const colorClass =
                        asr >= 50
                          ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          : asr > 0
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';

                      return (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${colorClass}`}>
                          {asr}% <span className="opacity-70 text-[9px]">({cat.success}/{cat.scored})</span>
                        </span>
                      );
                    };

                    return (
                      <tr key={m.model} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-3 font-semibold text-slate-200 text-xs">
                          <span className="font-mono text-white">{m.model}</span>
                        </td>
                        <td className="py-2.5 px-2 text-center">{renderCell(dir)}</td>
                        <td className="py-2.5 px-2 text-center">{renderCell(file)}</td>
                        <td className="py-2.5 px-2 text-center">{renderCell(url)}</td>
                        <td className="py-2.5 px-2 text-center">{renderCell(auth)}</td>
                        <td className="py-2.5 px-3 text-center">
                          {m.overall_asr !== null ? (
                            <span className="font-bold text-white text-xs px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                              {m.overall_asr}%
                            </span>
                          ) : (
                            <span className="text-slate-700">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Visual Charts */}
        <div className="space-y-4">
          {/* Verdict Distribution Donut */}
          <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800/80">
            <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider mb-2">
              Verdict Breakdown
            </h3>
            {donutData.length === 0 ? (
              <div className="py-8 text-center text-slate-600 font-mono text-xs">No scored results yet</div>
            ) : (
              <>
                <div className="h-36 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={62}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {donutData.map((entry, i) => (
                          <Cell key={`cell-${i}`} fill={entry.color} stroke="#090d16" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#090d16',
                          borderColor: '#334155',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 text-xs mt-2 font-mono">
                  {donutData.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-slate-300 text-[11px]">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                        <span>{d.name}</span>
                      </div>
                      <span className="font-bold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Model Vulnerability Bar Chart */}
          {barData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800/80">
              <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider mb-2">
                Overall ASR by Model
              </h3>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="model" tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'monospace' }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'monospace' }} domain={[0, 100]} unit="%" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#090d16',
                        borderColor: '#334155',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                      }}
                      formatter={(val: any) => [`${val ?? 0}%`, 'ASR']}
                      labelFormatter={(label: any) => barData.find(d => d.model === String(label))?.fullModel || String(label)}
                    />
                    <Bar dataKey="asr" fill="#f43f5e" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
