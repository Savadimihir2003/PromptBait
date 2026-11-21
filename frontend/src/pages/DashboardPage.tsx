import { useEffect, useState } from 'react';
import { fetchASR, fetchResults } from '../lib/api';
import type { ModelASR, ResultRow, CategoryASR } from '../types';
import { ShieldCheck, AlertTriangle, Bug, Activity } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export const DashboardPage: React.FC = () => {
  const [asrData, setAsrData] = useState<ModelASR[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [asr, res] = await Promise.all([fetchASR(), fetchResults()]);
        setAsrData(asr);
        setResults(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Dynamic computations from actual data
  const baselineResults = results.filter(r => r.defense === 'none');
  const totalEvaluated = results.length;
  const successes = results.filter(r => r.verdict === 'attack_success').length;
  const misses = results.filter(r => r.verdict === 'miss').length;
  const errors = results.filter(r => r.verdict === 'error').length;

  // Highest ASR across all models (baseline only)
  const highestASR = asrData.reduce((max, m) =>
    (m.overall_asr !== null && m.overall_asr > max) ? m.overall_asr : max, 0);
  const highestASRModel = asrData.find(m => m.overall_asr === highestASR)?.model || '—';

  // Defense delta
  const defenseResults = results.filter(r => r.defense !== 'none');
  const defenseSuccesses = defenseResults.filter(r => r.verdict === 'attack_success').length;
  const defenseTotal = defenseResults.filter(r => ['attack_success', 'miss'].includes(r.verdict)).length;
  const defenseASR = defenseTotal > 0 ? Math.round(100 * defenseSuccesses / defenseTotal) : null;

  const donutData = [
    { name: 'Attack Success', value: successes, color: '#f43f5e' },
    { name: 'Resisted', value: misses, color: '#10b981' },
    { name: 'Error', value: errors, color: '#f59e0b' },
  ].filter(d => d.value > 0);

  // Bar chart data: per-model overall ASR
  const barData = asrData.map(m => ({
    model: (m.model.replace('gq/', '').split('/').pop()) || m.model,
    fullModel: m.model,
    asr: m.overall_asr ?? 0,
  }));

  if (loading) {
    return (
      <div className="p-4 sm:p-8 flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-rose-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-slate-400 font-mono text-sm">Loading evaluation metrics...</p>
        </div>
      </div>
    );
  }

  const hasData = results.length > 0 || asrData.length > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {!hasData && (
        <div className="p-6 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-300 font-mono text-sm">
          <div className="font-bold mb-1">⚠ No evaluation data found</div>
          <div className="text-amber-400/70 text-xs">Run an attack from the Live Runner tab, or run: <code className="bg-slate-900 px-1 rounded">python -m promptbait lab run</code></div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <div className="p-4 sm:p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Total Runs</span>
            <Activity className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">{totalEvaluated}</div>
          <div className="text-xs text-slate-500">{results.length > 0 ? `${baselineResults.length} baseline · ${defenseResults.length} defended` : 'No runs yet'}</div>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Highest ASR</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className={`text-2xl sm:text-3xl font-extrabold font-mono ${highestASR > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
            {highestASR > 0 ? `${highestASR}%` : '—'}
          </div>
          <div className="text-xs text-rose-400/70 truncate">{highestASR > 0 ? highestASRModel : 'No data yet'}</div>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Defense ASR</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className={`text-2xl sm:text-3xl font-extrabold font-mono ${defenseASR !== null ? (defenseASR < highestASR ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-500'}`}>
            {defenseASR !== null ? `${defenseASR}%` : '—'}
          </div>
          <div className="text-xs text-slate-500">
            {defenseASR !== null && highestASR > 0
              ? `${highestASR - defenseASR > 0 ? '↓' : '→'} ${Math.abs(highestASR - defenseASR)}pp vs baseline`
              : 'Run with defense=v1 to compare'}
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Judge Mode</span>
            <Bug className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-white font-mono">Deterministic</div>
          <div className="text-xs text-slate-400">Canary token · Email forensics</div>
        </div>
      </div>

      {/* Charts + Table Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ASR Matrix Table */}
        <div className="xl:col-span-2 p-4 sm:p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-base font-bold text-white">ASR Matrix</h3>
            <span className="text-xs text-slate-400 font-mono">By model × delivery category</span>
          </div>

          {asrData.length === 0 ? (
            <div className="py-12 text-center text-slate-600 font-mono text-sm">No evaluation data yet</div>
          ) : (
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-left text-sm border-collapse min-w-[520px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs font-mono uppercase">
                    <th className="py-3 px-3">Model</th>
                    <th className="py-3 px-2 text-center">DIR</th>
                    <th className="py-3 px-2 text-center">FILE</th>
                    <th className="py-3 px-2 text-center">URL</th>
                    <th className="py-3 px-2 text-center">AUTH</th>
                    <th className="py-3 px-3 text-center">Overall</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {asrData.map((m) => {
                    const dir = m.categories.find((c: CategoryASR) => c.category === 'DIR');
                    const file = m.categories.find((c: CategoryASR) => c.category === 'FILE');
                    const url = m.categories.find((c: CategoryASR) => c.category === 'URL');
                    const auth = m.categories.find((c: CategoryASR) => c.category === 'AUTH');

                    const formatCell = (asr: number | null, success: number, scored: number) => {
                      if (scored === 0) return <span className="text-slate-700">—</span>;
                      const color = (asr ?? 0) >= 50
                        ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                        : (asr ?? 0) > 0
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                      return (
                        <span className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold ${color}`}>
                          {asr ?? 0}%<span className="text-slate-500 ml-1">({success}/{scored})</span>
                        </span>
                      );
                    };

                    return (
                      <tr key={m.model} className="hover:bg-slate-800/20">
                        <td className="py-3 px-3 text-slate-200 text-xs max-w-[140px] truncate" title={m.model}>{m.model}</td>
                        <td className="py-3 px-2 text-center">{formatCell(dir?.asr_percent ?? null, dir?.success ?? 0, dir?.scored ?? 0)}</td>
                        <td className="py-3 px-2 text-center">{formatCell(file?.asr_percent ?? null, file?.success ?? 0, file?.scored ?? 0)}</td>
                        <td className="py-3 px-2 text-center">{formatCell(url?.asr_percent ?? null, url?.success ?? 0, url?.scored ?? 0)}</td>
                        <td className="py-3 px-2 text-center">{formatCell(auth?.asr_percent ?? null, auth?.success ?? 0, auth?.scored ?? 0)}</td>
                        <td className="py-3 px-3 text-center font-bold text-white text-sm">
                          {m.overall_asr !== null ? `${m.overall_asr}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right column: Donut + Bar */}
        <div className="space-y-4">
          {/* Verdict Donut */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-900 border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-3">Verdict Distribution</h3>
            {donutData.length === 0 ? (
              <div className="py-8 text-center text-slate-600 font-mono text-xs">No results yet</div>
            ) : (
              <>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value">
                        {donutData.map((entry, i) => (
                          <Cell key={`cell-${i}`} fill={entry.color} stroke="#0f172a" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 text-xs mt-2">
                  {donutData.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-slate-300">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                        <span>{d.name}</span>
                      </div>
                      <span className="font-mono font-bold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Bar chart */}
          {barData.length > 0 && (
            <div className="p-4 sm:p-5 rounded-xl bg-slate-900 border border-slate-800">
              <h3 className="text-sm font-bold text-white mb-3">ASR by Model</h3>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="model" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={[0, 100]} unit="%" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(val: any) => [`${val ?? 0}%`, 'ASR']}
                      labelFormatter={(label: any) => barData.find(d => d.model === String(label))?.fullModel || String(label)}
                    />
                    <Bar dataKey="asr" fill="#f43f5e" radius={[3, 3, 0, 0]} />
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
