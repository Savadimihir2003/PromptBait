import React, { useEffect, useState, useCallback } from 'react';
import { fetchResults, fetchTranscript } from '../lib/api';
import type { ResultRow, TranscriptStep } from '../types';
import { Search, Server, Zap, CheckCircle2, XCircle, RefreshCw, Terminal } from 'lucide-react';

export const ReplayPage: React.FC = () => {
  const [results, setResults] = useState<ResultRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<ResultRow | null>(null);
  const [transcript, setTranscript] = useState<TranscriptStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<'ALL' | 'attack_success' | 'miss' | 'error'>('ALL');

  const loadResults = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const res = await fetchResults();
      setResults(res);
      // Select the first (latest) run if none selected or if previously selected run no longer exists
      if (res.length > 0 && !selectedRow) {
        setSelectedRow(res[0]);
      }
    } catch (err) {
      console.error('Failed to load replay results', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedRow]);

  useEffect(() => {
    loadResults();

    // 60-second periodic background sync
    const syncInterval = setInterval(() => {
      loadResults();
    }, 60000);

    const handleRefresh = () => {
      loadResults();
    };
    window.addEventListener('promptbait:run_completed', handleRefresh);
    window.addEventListener('promptbait:refresh', handleRefresh);
    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('promptbait:run_completed', handleRefresh);
      window.removeEventListener('promptbait:refresh', handleRefresh);
    };
  }, [loadResults]);

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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-3.5rem)] space-y-4 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3 flex-shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-slate-300 font-semibold uppercase tracking-wider">Harness / Forensics</span>
            <span className="text-slate-500">/</span>
            <span className="text-xs font-mono text-rose-400 font-bold uppercase tracking-wider">Deterministic Audit Trail</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-1">
            Evidence Ledger &amp; Transcript Replay
          </h2>
        </div>

        <div className="flex items-center space-x-2.5">
          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search case, model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-md pl-8 pr-2.5 py-1.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 font-mono focus:outline-none focus:border-rose-500 w-48 sm:w-64"
            />
          </div>

          {/* Verdict Filter Chips */}
          <div className="flex rounded-md bg-slate-950 border border-slate-800 p-0.5 text-xs font-mono">
            {(['ALL', 'attack_success', 'miss', 'error'] as const).map((vf) => (
              <button
                key={vf}
                onClick={() => setVerdictFilter(vf)}
                className={`px-2.5 py-1 rounded transition text-xs font-semibold ${
                  verdictFilter === vf
                    ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {vf === 'ALL' ? 'All' : vf === 'attack_success' ? 'Vulnerable' : vf === 'miss' ? 'Resisted' : 'Error'}
              </button>
            ))}
          </div>

          <button
            onClick={() => loadResults()}
            disabled={isRefreshing}
            className="p-2 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition shadow-sm"
            title="Reload ledger"
          >
            <RefreshCw className={`w-4 h-4 text-rose-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Split Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Left: Execution List */}
        <div className="bg-[#0b0f19] border border-slate-800 rounded-lg flex flex-col overflow-hidden max-h-64 lg:max-h-none shadow-sm">
          <div className="px-3.5 py-2.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-200 font-bold uppercase text-xs tracking-wider">Historical Runs</span>
            <span className="text-slate-300 text-xs font-semibold">
              {filteredResults.length} / {results.length} rows
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
            {filteredResults.length === 0 ? (
              <div className="p-6 text-center text-slate-400 font-mono text-sm">
                No matching execution records in ledger.
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
                    className={`p-3.5 cursor-pointer text-xs font-mono transition ${
                      isSelected
                        ? 'bg-rose-500/15 border-l-2 border-rose-500'
                        : 'hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-extrabold text-white text-sm">{r.case_id}</span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold uppercase text-xs border ${
                          r.verdict === 'attack_success'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : r.verdict === 'miss'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {r.verdict === 'attack_success' ? 'PWNED' : r.verdict === 'miss' ? 'RESISTED' : 'ERROR'}
                      </span>
                    </div>
                    <div className="text-slate-200 truncate text-xs font-semibold">{r.model}</div>
                    <div className="flex items-center justify-between mt-1 text-xs text-slate-400 font-medium">
                      <span>{r.category} · {r.delivery}</span>
                      {r.defense !== 'none' && (
                        <span className="text-purple-300 font-semibold">def: {r.defense}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detailed Forensic Ledger */}
        <div className="lg:col-span-2 bg-[#090d16] border border-slate-800 rounded-lg flex flex-col overflow-hidden font-mono text-xs min-h-0 shadow-sm">
          {selectedRow && (
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <span className="text-slate-400 text-xs uppercase font-semibold tracking-wider">Audit Target:</span>
                <span className="text-white font-extrabold text-sm">{selectedRow.case_id}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-200 text-sm font-semibold truncate max-w-[220px]">{selectedRow.model}</span>
                {selectedRow.defense !== 'none' && (
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-bold">
                    {selectedRow.defense}
                  </span>
                )}
              </div>
              <div className="text-slate-300 text-xs font-medium">
                {selectedRow.used_steps} step(s) · Category: {selectedRow.category}
              </div>
            </div>
          )}

          {/* Forensic Evidence Rationale Block */}
          {selectedRow?.evidence && selectedRow.evidence.length > 0 && (
            <div className="px-4 py-3.5 bg-slate-950/90 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider mb-1.5">
                {selectedRow.verdict === 'attack_success' ? (
                  <>
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span className="text-rose-400 font-bold">Deterministic Proof Signals:</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">Deterministic Verification Rationale:</span>
                  </>
                )}
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-200 font-sans text-sm font-medium">
                {selectedRow.evidence.map((ev: string, idx: number) => (
                  <li key={idx} className={selectedRow.verdict === 'attack_success' ? 'text-rose-300' : 'text-emerald-300'}>
                    {ev}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Transcript Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center h-48 space-x-2 text-slate-300 font-mono text-sm">
                <RefreshCw className="w-4 h-4 text-rose-500 animate-spin" />
                <span>Reading execution trace from filesystem...</span>
              </div>
            ) : transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 font-mono text-sm space-y-2">
                <Terminal className="w-6 h-6 text-slate-500" />
                <span>No step-by-step transcript captured for this historical row.</span>
              </div>
            ) : (
              transcript.map((step, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-lg border text-sm leading-relaxed ${
                    step.role === 'tool'
                      ? 'bg-slate-900/95 border-slate-800 text-slate-200'
                      : 'bg-rose-950/20 border-rose-900/40 text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-xs uppercase mb-1.5 opacity-90">
                    <span className="flex items-center space-x-1.5">
                      {step.role === 'tool' ? (
                        <>
                          <Server className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="text-cyan-300 font-mono font-bold">Tool Call: {step.tool_name}</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 text-rose-400" />
                          <span className="text-rose-300 font-mono font-bold">Model Response</span>
                        </>
                      )}
                    </span>
                    {step.tool_ok !== undefined && (
                      <span className={`font-mono font-bold ${step.tool_ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {step.tool_ok ? 'GATE: PASSED' : 'GATE: BLOCKED'}
                      </span>
                    )}
                  </div>

                  {step.content && (
                    <p className="whitespace-pre-wrap font-sans text-sm text-slate-100 mt-1 leading-relaxed font-normal">
                      {step.content}
                    </p>
                  )}

                  {step.tool_args && (
                    <div className="mt-2 bg-slate-950 p-2.5 rounded border border-slate-800/80 text-xs text-slate-300 overflow-x-auto">
                      <span className="text-slate-400 font-bold block text-xs mb-1 uppercase tracking-wider">ARGS:</span>
                      <pre className="font-mono">{JSON.stringify(step.tool_args, null, 2)}</pre>
                    </div>
                  )}

                  {step.tool_output && (
                    <div className="mt-2 bg-slate-950 p-2.5 rounded border border-slate-800/80 text-xs text-slate-300 overflow-x-auto max-h-48">
                      <span className="text-slate-400 font-bold block text-xs mb-1 uppercase tracking-wider">OUTPUT:</span>
                      <pre className="whitespace-pre-wrap font-mono">{step.tool_output}</pre>
                    </div>
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
