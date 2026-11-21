import { useEffect, useState } from 'react';
import { fetchResults, fetchTranscript } from '../lib/api';
import type { ResultRow, TranscriptStep } from '../types';
import { History, Search, Server, Zap, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

export const ReplayPage: React.FC = () => {
  const [results, setResults] = useState<ResultRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<ResultRow | null>(null);
  const [transcript, setTranscript] = useState<TranscriptStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<'ALL' | 'attack_success' | 'miss' | 'error'>('ALL');

  useEffect(() => {
    fetchResults().then((res: ResultRow[]) => {
      setResults(res);
      if (res.length > 0) {
        setSelectedRow(res[0]);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedRow) return;
    setLoading(true);
    fetchTranscript(selectedRow.model, selectedRow.case_id, selectedRow.defense)
      .then(setTranscript)
      .catch(() => setTranscript([]))
      .finally(() => setLoading(false));
  }, [selectedRow]);

  const filteredResults = results.filter((r) => {
    const matchesVerdict = verdictFilter === 'ALL' || r.verdict === verdictFilter;
    const matchesSearch =
      r.case_id.toLowerCase().includes(search.toLowerCase()) ||
      r.model.toLowerCase().includes(search.toLowerCase()) ||
      r.defense.toLowerCase().includes(search.toLowerCase());
    return matchesVerdict && matchesSearch;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto flex flex-col lg:h-[calc(100vh-3.5rem)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Evidence Forensics &amp; Replay</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Deterministic forensic audits, canary token proofs, and complete agent tool interaction traces.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Filter by case, model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-rose-500"
            />
          </div>
          <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs font-mono">
            {(['ALL', 'attack_success', 'miss', 'error'] as const).map((vf) => (
              <button
                key={vf}
                onClick={() => setVerdictFilter(vf)}
                className={`px-2.5 py-1 rounded-md transition ${
                  verdictFilter === vf
                    ? 'bg-rose-500/20 text-rose-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {vf === 'ALL' ? 'All' : vf === 'attack_success' ? 'Success' : vf === 'miss' ? 'Miss' : 'Error'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 flex-1 min-h-0">
        {/* Results List */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden max-h-64 lg:max-h-none">
          <div className="p-3.5 border-b border-slate-800 font-mono text-xs uppercase font-bold text-slate-400 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <History className="w-4 h-4 text-slate-500" />
              <span>Historical Runs</span>
            </div>
            <span className="text-[11px] text-slate-500">{filteredResults.length} / {results.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {filteredResults.length === 0 ? (
              <div className="p-6 text-center text-slate-600 font-mono text-xs">
                No matching execution records found.
              </div>
            ) : (
              filteredResults.map((r, i) => {
                const isSelected =
                  selectedRow?.case_id === r.case_id &&
                  selectedRow?.model === r.model &&
                  selectedRow?.defense === r.defense;
                return (
                  <div
                    key={i}
                    onClick={() => setSelectedRow(r)}
                    className={`p-3 cursor-pointer text-xs font-mono transition ${
                      isSelected
                        ? 'bg-rose-500/15 border-l-2 border-rose-500'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white">{r.case_id}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold uppercase text-[10px] ${
                          r.verdict === 'attack_success'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : r.verdict === 'miss'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {r.verdict === 'attack_success' ? 'PWNED' : r.verdict === 'miss' ? 'RESISTED' : 'ERROR'}
                      </span>
                    </div>
                    <div className="text-slate-400 truncate text-[11px]">{r.model}</div>
                    {r.defense !== 'none' && (
                      <span className="text-[10px] text-purple-400 font-mono">defense: {r.defense}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detailed Transcript View */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden font-mono text-xs">
          {selectedRow && (
            <div className="p-3.5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <span className="text-slate-400">Audit:</span>
                <span className="text-white font-bold text-sm">{selectedRow.case_id}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-300 text-xs truncate max-w-[200px]">{selectedRow.model}</span>
                {selectedRow.defense !== 'none' && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px]">
                    {selectedRow.defense}
                  </span>
                )}
              </div>
              <div className="text-slate-400 text-xs">
                {selectedRow.used_steps} step(s) · {selectedRow.category}
              </div>
            </div>
          )}

          {/* Evidence Callout */}
          {selectedRow?.evidence && selectedRow.evidence.length > 0 && (
            <div className="p-3.5 bg-slate-950 border-b border-slate-800">
              <div className="flex items-center space-x-1.5 text-rose-400 font-bold text-[11px] uppercase tracking-wider mb-1.5">
                {selectedRow.verdict === 'attack_success' ? (
                  <XCircle className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Judge Forensic Verdict Rationale:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-300 font-sans text-xs">
                {selectedRow.evidence.map((ev: string, idx: number) => (
                  <li key={idx} className={selectedRow.verdict === 'attack_success' ? 'text-rose-300' : 'text-emerald-300'}>
                    {ev}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Transcript List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/60 min-h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center h-48 space-x-2 text-slate-500">
                <div className="w-4 h-4 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
                <span>Loading execution trace...</span>
              </div>
            ) : transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-600 space-y-2">
                <AlertCircle className="w-6 h-6 text-slate-700" />
                <span>No step-by-step transcript captured for this historical row.</span>
              </div>
            ) : (
              transcript.map((step, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    step.role === 'tool'
                      ? 'bg-slate-900/80 border-slate-800 text-slate-300'
                      : 'bg-rose-950/15 border-rose-900/20 text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold mb-1 opacity-70">
                    <span className="uppercase flex items-center space-x-1">
                      {step.role === 'tool' ? (
                        <>
                          <Server className="w-3 h-3" />
                          <span>Tool Call: {step.tool_name}</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3 h-3" />
                          <span>Assistant Response</span>
                        </>
                      )}
                    </span>
                    {step.tool_ok !== undefined && (
                      <span className={step.tool_ok ? 'text-emerald-400' : 'text-rose-400'}>
                        {step.tool_ok ? 'OK' : 'BLOCKED / FAILED'}
                      </span>
                    )}
                  </div>
                  {step.content && (
                    <p className="whitespace-pre-wrap font-sans text-xs text-slate-200 mt-1 leading-relaxed">
                      {step.content}
                    </p>
                  )}
                  {step.tool_args && (
                    <pre className="mt-1 bg-slate-950/80 p-2 rounded text-[11px] text-slate-400 overflow-x-auto">
                      args: {JSON.stringify(step.tool_args, null, 2)}
                    </pre>
                  )}
                  {step.tool_output && (
                    <pre className="mt-1 bg-slate-950/80 p-2 rounded text-[11px] text-slate-400 overflow-x-auto max-h-40">
                      output: {step.tool_output}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
