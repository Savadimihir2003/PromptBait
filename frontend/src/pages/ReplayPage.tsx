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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3 flex-shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Harness / Forensics</span>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-mono text-rose-400 font-semibold uppercase">Deterministic Audit Trail</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight mt-0.5">
            Evidence Ledger &amp; Transcript Replay
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search case, model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-rose-500 w-44 sm:w-56"
            />
          </div>

          {/* Verdict Filter Chips */}
          <div className="flex rounded bg-slate-950 border border-slate-800 p-0.5 text-xs font-mono">
            {(['ALL', 'attack_success', 'miss', 'error'] as const).map((vf) => (
              <button
                key={vf}
                onClick={() => setVerdictFilter(vf)}
                className={`px-2 py-0.5 rounded transition text-[11px] font-medium ${
                  verdictFilter === vf
                    ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {vf === 'ALL' ? 'All' : vf === 'attack_success' ? 'Vulnerable' : vf === 'miss' ? 'Resisted' : 'Error'}
              </button>
            ))}
          </div>

          <button
            onClick={() => loadResults()}
            disabled={isRefreshing}
            className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
            title="Reload ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-rose-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Split Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Left: Execution List */}
        <div className="bg-[#0b0f19] border border-slate-800/80 rounded-lg flex flex-col overflow-hidden max-h-64 lg:max-h-none">
          <div className="px-3.5 py-2.5 border-b border-slate-800/80 bg-slate-950 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Historical Runs</span>
            <span className="text-slate-500 text-[11px]">
              {filteredResults.length} / {results.length} rows
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
            {filteredResults.length === 0 ? (
              <div className="p-6 text-center text-slate-600 font-mono text-xs">
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
                    className={`p-3 cursor-pointer text-xs font-mono transition ${
                      isSelected
                        ? 'bg-rose-500/10 border-l-2 border-rose-500'
                        : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white text-xs">{r.case_id}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded font-bold uppercase text-[9px] border ${
                          r.verdict === 'attack_success'
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : r.verdict === 'miss'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {r.verdict === 'attack_success' ? 'PWNED' : r.verdict === 'miss' ? 'RESISTED' : 'ERROR'}
                      </span>
                    </div>
                    <div className="text-slate-400 truncate text-[11px]">{r.model}</div>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                      <span>{r.category} · {r.delivery}</span>
                      {r.defense !== 'none' && (
                        <span className="text-purple-400">def: {r.defense}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detailed Forensic Ledger */}
        <div className="lg:col-span-2 bg-[#090d16] border border-slate-800/80 rounded-lg flex flex-col overflow-hidden font-mono text-xs min-h-0">
          {selectedRow && (
            <div className="px-4 py-2.5 border-b border-slate-800/80 bg-slate-950 flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <span className="text-slate-500 text-[11px] uppercase tracking-wider">Audit Target:</span>
                <span className="text-white font-bold text-xs">{selectedRow.case_id}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-300 text-xs truncate max-w-[200px]">{selectedRow.model}</span>
                {selectedRow.defense !== 'none' && (
                  <span className="px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px]">
                    {selectedRow.defense}
                  </span>
                )}
              </div>
              <div className="text-slate-400 text-[11px]">
                {selectedRow.used_steps} step(s) · Category: {selectedRow.category}
              </div>
            </div>
          )}

          {/* Forensic Evidence Rationale Block */}
          {selectedRow?.evidence && selectedRow.evidence.length > 0 && (
            <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800/80 flex-shrink-0">
              <div className="flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wider mb-1">
                {selectedRow.verdict === 'attack_success' ? (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-rose-400">Deterministic Proof Signals:</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Deterministic Verification Rationale:</span>
                  </>
                )}
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-300 font-sans text-xs">
                {selectedRow.evidence.map((ev: string, idx: number) => (
                  <li key={idx} className={selectedRow.verdict === 'attack_success' ? 'text-rose-300' : 'text-emerald-300'}>
                    {ev}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Transcript Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {loading ? (
              <div className="flex items-center justify-center h-48 space-x-2 text-slate-500">
                <RefreshCw className="w-4 h-4 text-rose-500 animate-spin" />
                <span>Reading execution trace from filesystem...</span>
              </div>
            ) : transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-600 space-y-2">
                <Terminal className="w-6 h-6 text-slate-700" />
                <span>No step-by-step transcript captured for this historical row.</span>
              </div>
            ) : (
              transcript.map((step, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded border text-xs leading-relaxed ${
                    step.role === 'tool'
                      ? 'bg-slate-900/90 border-slate-800 text-slate-300'
                      : 'bg-rose-950/15 border-rose-900/30 text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-[10px] uppercase mb-1 opacity-70">
                    <span className="flex items-center space-x-1">
                      {step.role === 'tool' ? (
                        <>
                          <Server className="w-3 h-3 text-cyan-400" />
                          <span className="text-cyan-300">Tool Call: {step.tool_name}</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3 h-3 text-rose-400" />
                          <span className="text-rose-300">Model Response</span>
                        </>
                      )}
                    </span>
                    {step.tool_ok !== undefined && (
                      <span className={step.tool_ok ? 'text-emerald-400' : 'text-rose-400'}>
                        {step.tool_ok ? 'GATE: PASSED' : 'GATE: BLOCKED'}
                      </span>
                    )}
                  </div>

                  {step.content && (
                    <p className="whitespace-pre-wrap font-sans text-xs text-slate-200 mt-1 leading-relaxed">
                      {step.content}
                    </p>
                  )}

                  {step.tool_args && (
                    <div className="mt-1 bg-slate-950/80 p-2 rounded text-[11px] text-slate-400 overflow-x-auto border border-slate-900">
                      <span className="text-slate-500 font-bold block text-[10px] mb-0.5">ARGS:</span>
                      <pre>{JSON.stringify(step.tool_args, null, 2)}</pre>
                    </div>
                  )}

                  {step.tool_output && (
                    <div className="mt-1 bg-slate-950/80 p-2 rounded text-[11px] text-slate-400 overflow-x-auto max-h-36 border border-slate-900">
                      <span className="text-slate-500 font-bold block text-[10px] mb-0.5">OUTPUT:</span>
                      <pre className="whitespace-pre-wrap">{step.tool_output}</pre>
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
