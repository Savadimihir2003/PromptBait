import { useEffect, useState } from 'react';
import { fetchResults, fetchTranscript } from '../lib/api';
import type { ResultRow, TranscriptStep } from '../types';
import { History } from 'lucide-react';

export const ReplayPage: React.FC = () => {
  const [results, setResults] = useState<ResultRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<ResultRow | null>(null);
  const [transcript, setTranscript] = useState<TranscriptStep[]>([]);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-4rem)]">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Evidence Forensics & Transcript Replay</h2>
        <p className="text-sm text-slate-400 mt-1">
          Inspect deterministic artifact audits, tool parameters, and full execution traces for historical runs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-hidden">
        {/* Results List */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 font-mono text-xs uppercase font-bold text-slate-400 flex items-center space-x-2">
            <History className="w-4 h-4 text-slate-500" />
            <span>Committed Result Rows ({results.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {results.map((r, i) => {
              const isSelected = selectedRow?.case_id === r.case_id && selectedRow?.model === r.model;
              return (
                <div
                  key={i}
                  onClick={() => setSelectedRow(r)}
                  className={`p-3.5 cursor-pointer text-xs font-mono transition ${
                    isSelected ? 'bg-rose-500/15 border-l-2 border-rose-500' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white">{r.case_id}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold uppercase text-[10px] ${
                        r.verdict === 'attack_success'
                          ? 'bg-rose-500/20 text-rose-400'
                          : r.verdict === 'miss'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {r.verdict}
                    </span>
                  </div>
                  <div className="text-slate-400 truncate">{r.model}</div>
                  {r.defense !== 'none' && (
                    <span className="text-[10px] text-purple-400">defense: {r.defense}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed Transcript View */}
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden font-mono text-xs">
          {selectedRow && (
            <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
              <div>
                <span className="text-slate-400">Case Audit: </span>
                <span className="text-white font-bold text-sm">{selectedRow.case_id}</span>
                <span className="text-slate-500 mx-2">•</span>
                <span className="text-slate-300">{selectedRow.model}</span>
              </div>
              <div className="text-slate-400">Steps: {selectedRow.used_steps}</div>
            </div>
          )}

          {/* Evidence Highlight Callout */}
          {selectedRow?.evidence && selectedRow.evidence.length > 0 && (
            <div className="p-4 bg-slate-950 border-b border-slate-800">
              <span className="text-slate-400 uppercase tracking-wider block mb-1 text-[11px] font-bold">
                Deterministic Judge Verdict Reason:
              </span>
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                {selectedRow.evidence.map((ev: string, idx: number) => (
                  <li key={idx} className="text-rose-300 font-sans">{ev}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Transcript List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/60">
            {loading ? (
              <div className="text-slate-500 text-center py-12">Loading transcript steps...</div>
            ) : transcript.length === 0 ? (
              <div className="text-slate-500 text-center py-12">No transcript recorded for this row.</div>
            ) : (
              transcript.map((step, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    step.role === 'tool'
                      ? 'bg-slate-900/80 border-slate-800 text-slate-300'
                      : 'bg-slate-900 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold mb-1 opacity-70">
                    <span className="uppercase">{step.role === 'tool' ? `Tool Call: ${step.tool_name}` : 'Assistant'}</span>
                    {step.tool_ok !== undefined && (
                      <span className={step.tool_ok ? 'text-emerald-400' : 'text-rose-400'}>
                        {step.tool_ok ? 'OK' : 'FAILED'}
                      </span>
                    )}
                  </div>
                  {step.content && <p className="whitespace-pre-wrap font-sans text-sm">{step.content}</p>}
                  {step.tool_args && (
                    <pre className="mt-1 bg-slate-950 p-2 rounded text-[11px] text-slate-400 overflow-x-auto">
                      args: {JSON.stringify(step.tool_args, null, 2)}
                    </pre>
                  )}
                  {step.tool_output && (
                    <pre className="mt-1 bg-slate-950 p-2 rounded text-[11px] text-slate-400 overflow-x-auto max-h-40">
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
