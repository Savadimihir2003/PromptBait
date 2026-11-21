import { useEffect, useState } from 'react';
import { fetchASR, fetchResults } from '../lib/api';
import type { ModelASR, ResultRow, CategoryASR } from '../types';
import { ShieldCheck, AlertTriangle, Bug, Activity } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

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

  const totalCases = 24;
  const successes = results.filter((r) => r.verdict === 'attack_success').length;
  const misses = results.filter((r) => r.verdict === 'miss').length;
  const errors = results.filter((r) => r.verdict === 'error').length;

  const donutData = [
    { name: 'Attack Success', value: successes, color: '#f43f5e' },
    { name: 'Resisted (Miss)', value: misses, color: '#10b981' },
    { name: 'Provider Error', value: errors, color: '#f59e0b' },
  ].filter((d) => d.value > 0);

  if (loading) {
    return <div className="p-8 text-slate-400 font-mono">Loading evaluation metrics...</div>;
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Evaluated Attacks</span>
            <Activity className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-3xl font-extrabold text-white">{totalCases}</div>
          <div className="text-xs text-slate-400">4 distinct injection delivery vectors</div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Overall Baseline ASR</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-3xl font-extrabold text-rose-400">21%</div>
          <div className="text-xs text-rose-400/80">qwen2.5:3b (5/24 attacks succeeded)</div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Defense v1 ASR</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400">17%</div>
          <div className="text-xs text-emerald-400/80">Blocked DIR-01 & AUTH-01 via Email Gate</div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Evaluation Judge</span>
            <Bug className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">Zero LLM Vibes</div>
          <div className="text-xs text-slate-400">100% Deterministic Evidence Forensics</div>
        </div>
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap / Table */}
        <div className="lg:col-span-2 p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Attack Success Rate (ASR) Matrix</h3>
            <span className="text-xs text-slate-400 font-mono">By Delivery Category</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs font-mono uppercase">
                  <th className="py-3 px-4">Model & Configuration</th>
                  <th className="py-3 px-3 text-center">DIR (5)</th>
                  <th className="py-3 px-3 text-center">FILE (9)</th>
                  <th className="py-3 px-3 text-center">URL (6)</th>
                  <th className="py-3 px-3 text-center">AUTH (4)</th>
                  <th className="py-3 px-4 text-center">Overall ASR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {asrData.map((m) => {
                  const dir = m.categories.find((c: CategoryASR) => c.category === 'DIR');
                  const file = m.categories.find((c: CategoryASR) => c.category === 'FILE');
                  const url = m.categories.find((c: CategoryASR) => c.category === 'URL');
                  const auth = m.categories.find((c: CategoryASR) => c.category === 'AUTH');

                  const formatCell = (asr: number | null, success: number, scored: number) => {
                    if (scored === 0) return <span className="text-slate-600">—</span>;
                    const color =
                      (asr ?? 0) >= 50
                        ? 'text-rose-400 bg-rose-500/10'
                        : (asr ?? 0) > 0
                        ? 'text-amber-400 bg-amber-500/10'
                        : 'text-emerald-400 bg-emerald-500/10';
                    return (
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${color}`}>
                        {asr ?? 0}% ({success}/{scored})
                      </span>
                    );
                  };

                  return (
                    <tr key={m.model} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-semibold text-slate-200">{m.model}</td>
                      <td className="py-3 px-3 text-center">
                        {formatCell(dir?.asr_percent ?? null, dir?.success ?? 0, dir?.scored ?? 0)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {formatCell(file?.asr_percent ?? null, file?.success ?? 0, file?.scored ?? 0)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {formatCell(url?.asr_percent ?? null, url?.success ?? 0, url?.scored ?? 0)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {formatCell(auth?.asr_percent ?? null, auth?.success ?? 0, auth?.scored ?? 0)}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-100">
                        {m.overall_asr !== null ? `${m.overall_asr}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Verdict Distribution Donut */}
        <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Verdict Distribution</h3>
            <p className="text-xs text-slate-400">Recorded across committed evaluation runs</p>
          </div>

          <div className="h-52 w-full my-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {donutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="#0f172a" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2 text-xs">
            {donutData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-slate-300">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span>{d.name}</span>
                </div>
                <span className="font-mono font-bold">{d.value} runs</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
