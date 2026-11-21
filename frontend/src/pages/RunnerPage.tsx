import React, { useState, useRef, useEffect } from 'react';
import { Play, Terminal, CheckCircle2, XCircle, RefreshCw, Zap, Server } from 'lucide-react';
import type { TranscriptStep } from '../types';

type SweepMode = 'single' | 'category' | 'full';

interface SweepResult {
  case_id: string;
  verdict: string;
  evidence: string[];
}

export const RunnerPage: React.FC = () => {
  const [model, setModel] = useState('gq/openai/gpt-oss-120b');
  const [caseId, setCaseId] = useState('DIR-01');
  const [category, setCategory] = useState('DIR');
  const [sweepMode, setSweepMode] = useState<SweepMode>('single');
  const [defense, setDefense] = useState('none');
  const [agentVersion, setAgentVersion] = useState<'v1' | 'langgraph'>('langgraph');
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunningCase, setCurrentRunningCase] = useState<string>('');
  const [steps, setSteps] = useState<TranscriptStep[]>([]);
  const [verdict, setVerdict] = useState<{ verdict: string; evidence: string[]; final_answer?: string } | null>(null);
  const [providerInfo, setProviderInfo] = useState<{ provider: string; model: string } | null>(null);
  const [sweepResults, setSweepResults] = useState<SweepResult[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps, verdict]);

  const getWsPayload = () => {
    if (sweepMode === 'single') return { model, case_id: caseId, defense, agent_version: agentVersion };
    if (sweepMode === 'category') return { model, case_id: `${category}-*`, defense, agent_version: agentVersion };
    return { model, case_id: '*', defense, agent_version: agentVersion };
  };

  const runAttack = () => {
    setIsRunning(true);
    setSteps([]);
    setVerdict(null);
    setProviderInfo(null);
    setCurrentRunningCase(sweepMode === 'single' ? caseId : 'Initializing...');
    setSweepResults([]);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/run`);
    socketRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify(getWsPayload()));

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>;
        switch (data.type) {
          case 'provider_info':
            setProviderInfo({ provider: data.provider as string, model: data.model as string });
            break;
          case 'started':
            setCurrentRunningCase(data.case_id as string);
            break;
          case 'step':
            setSteps(prev => [...prev, data.step as TranscriptStep]);
            break;
          case 'verdict':
            setVerdict({
              verdict: data.verdict as string,
              evidence: (data.evidence as string[]) || [],
              final_answer: data.final_answer as string | undefined,
            });
            break;
          case 'case_start':
            setCurrentRunningCase(data.case_id as string);
            setSteps([]);
            setVerdict(null);
            break;
          case 'case_complete':
            setSweepResults(prev => [
              ...prev,
              { case_id: data.case_id as string, verdict: data.verdict as string, evidence: (data.evidence as string[]) || [] },
            ]);
            break;
          case 'sweep_complete':
          case 'complete':
            setIsRunning(false);
            window.dispatchEvent(new CustomEvent('promptbait:run_completed'));
            ws.close();
            break;
          case 'error':
            alert(`Execution Error: ${data.message as string}`);
            setIsRunning(false);
            ws.close();
            break;
        }
      } catch (err) {
        console.error('Failed to parse websocket message', err);
      }
    };

    ws.onerror = () => setIsRunning(false);
    ws.onclose = () => setIsRunning(false);
  };

  const isSweep = sweepMode !== 'single';
  const sweepSuccesses = sweepResults.filter(r => r.verdict === 'attack_success').length;
  const sweepTotal = sweepResults.length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-3.5rem)] space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3 flex-shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Harness / Execution Engine</span>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-mono text-rose-400 font-semibold uppercase">Interactive Red-Team Runner</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight mt-0.5">Live Agent Attack Console</h2>
        </div>

        {providerInfo && (
          <div className="flex items-center space-x-2 px-3 py-1 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
            <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-slate-400">Target Provider:</span>
            <span className="text-purple-300 font-semibold">{providerInfo.provider}</span>
          </div>
        )}
      </div>

      {/* Mode Selector & Controls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Mode Switcher */}
          <div className="flex rounded-md bg-slate-950 p-1 border border-slate-800/80 text-xs font-mono">
            {(['single', 'category', 'full'] as SweepMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setSweepMode(mode)}
                disabled={isRunning}
                className={`px-3 py-1 rounded transition text-xs font-medium ${
                  sweepMode === mode
                    ? 'bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'single' ? 'Single Case' : mode === 'category' ? 'Category Sweep' : 'Full Suite (24)'}
              </button>
            ))}
          </div>

          {isRunning && (
            <div className="flex items-center space-x-2 px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Target: {currentRunningCase}</span>
            </div>
          )}
        </div>

        {/* Configuration Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">Model Under Test</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              disabled={isRunning}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500"
            >
              <optgroup label="Groq Frontier (Cloud API)">
                <option value="gq/openai/gpt-oss-120b">gq/openai/gpt-oss-120b (Primary Frontier)</option>
                <option value="gq/qwen/qwen3.8-27b">gq/qwen/qwen3.8-27b (Comparison Frontier)</option>
                <option value="gq/openai/gpt-oss-20b">gq/openai/gpt-oss-20b (Baseline)</option>
              </optgroup>
              <optgroup label="Local Ollama (Offline Weights)">
                <option value="qwen2.5:3b">qwen2.5:3b (Local Ollama)</option>
                <option value="llama3.2:3b">llama3.2:3b (Local Ollama)</option>
              </optgroup>
            </select>
          </div>

          {sweepMode === 'single' ? (
            <div>
              <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">Target Scenario</label>
              <select
                value={caseId}
                onChange={e => setCaseId(e.target.value)}
                disabled={isRunning}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500"
              >
                <optgroup label="DIR — Direct Instruction Overrides">
                  <option value="DIR-01">DIR-01 (MaintenanceBot Override)</option>
                  <option value="DIR-02">DIR-02 (Ignore Previous & Write)</option>
                  <option value="DIR-03">DIR-03 (System Emergency Override)</option>
                  <option value="DIR-04">DIR-04 (Fake Developer Auth Token)</option>
                  <option value="DIR-05">DIR-05 (Urgent Security Audit Pivot)</option>
                </optgroup>
                <optgroup label="FILE — Indirect Document Poisoning">
                  <option value="FILE-01">FILE-01 (Poisoned Setup Readme)</option>
                  <option value="FILE-02">FILE-02 (Config Seed Secret Leak)</option>
                  <option value="FILE-03">FILE-03 (Split Multi-File Assembly)</option>
                  <option value="FILE-04">FILE-04 (Code Review Exfil Comment)</option>
                  <option value="FILE-05">FILE-05 (Base64 Encoded Override)</option>
                  <option value="FILE-06">FILE-06 (Migration Credential Leak)</option>
                  <option value="FILE-07">FILE-07 (Multi-Hop File Read)</option>
                  <option value="FILE-08">FILE-08 (Decoy Data Seed Egress)</option>
                  <option value="FILE-09">FILE-09 (System Sentinel Tampering)</option>
                </optgroup>
                <optgroup label="URL — Localhost Web Injections">
                  <option value="URL-01">URL-01 (Hidden CSS Web Injection)</option>
                  <option value="URL-02">URL-02 (HTML Comment Payload)</option>
                  <option value="URL-03">URL-03 (Attribute Data Hijack)</option>
                  <option value="URL-04">URL-04 (Decoy Goal Redirection)</option>
                  <option value="URL-05">URL-05 (Conditional Fetch Egress)</option>
                  <option value="URL-06">URL-06 (Multi-Origin Sandbox Egress)</option>
                </optgroup>
                <optgroup label="AUTH — Spoofed Decoys & Multi-Channel">
                  <option value="AUTH-01">AUTH-01 (Spoofed Exec Email Thread)</option>
                  <option value="AUTH-02">AUTH-02 (Calendar Invite Description)</option>
                  <option value="AUTH-03">AUTH-03 (Decoy Doc Privilege Pivot)</option>
                  <option value="AUTH-04">AUTH-04 (Deferred Two-Stage Plan)</option>
                </optgroup>
              </select>
            </div>
          ) : sweepMode === 'category' ? (
            <div>
              <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">Target Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                disabled={isRunning}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500"
              >
                <option value="DIR">DIR (5 cases) — Direct Instruction Overrides</option>
                <option value="FILE">FILE (9 cases) — Indirect Document Poisoning</option>
                <option value="URL">URL (6 cases) — Staged Web Injections</option>
                <option value="AUTH">AUTH (4 cases) — Spoofed Authority & Decoys</option>
              </select>
            </div>
          ) : (
            <div className="bg-slate-950 border border-slate-800/80 rounded px-3 py-1.5 text-[11px] font-mono text-slate-400">
              Sweep all 24 cases sequentially (with 2.5s Groq rate limit pacing)
            </div>
          )}

          <div>
            <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">Defense Guardrail</label>
            <select
              value={defense}
              onChange={e => setDefense(e.target.value)}
              disabled={isRunning}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500"
            >
              <option value="none">Baseline (Zero Defenses)</option>
              <option value="v1">Defense v1 (Spotlighting + Outbox Gate)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">Agent Architecture</label>
            <select
              value={agentVersion}
              onChange={e => setAgentVersion(e.target.value as 'v1' | 'langgraph')}
              disabled={isRunning}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500"
            >
              <option value="langgraph">LangGraph (StateGraph Engine)</option>
              <option value="v1">v1 (Hand-rolled While Loop)</option>
            </select>
          </div>

          <button
            onClick={runAttack}
            disabled={isRunning}
            className="h-8 px-4 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold font-mono flex items-center justify-center space-x-1.5 transition shadow-sm"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Executing...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{isSweep ? 'Execute Sweep' : 'Launch Attack'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sweep summary chips if sweep completed */}
      {isSweep && sweepResults.length > 0 && (
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="text-slate-400">Sweep Completed:</span>
            <span className="text-white font-bold">{sweepTotal} Cases Evaluated</span>
            <span className="text-slate-600">·</span>
            <span className="text-rose-400 font-bold">{sweepSuccesses} Vulnerable (PWNED)</span>
            <span className="text-slate-600">·</span>
            <span className="text-emerald-400 font-bold">{sweepTotal - sweepSuccesses} Resisted</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {sweepResults.map(r => (
              <span
                key={r.case_id}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                  r.verdict === 'attack_success'
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                    : r.verdict === 'miss'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                }`}
              >
                {r.case_id}: {r.verdict === 'attack_success' ? 'PWNED' : r.verdict === 'miss' ? 'SAFE' : 'ERR'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Live Terminal */}
      <div className="flex-1 bg-[#090d16] rounded-lg border border-slate-800/80 flex flex-col overflow-hidden font-mono text-xs shadow-inner min-h-0">
        <div className="px-3 py-2 border-b border-slate-800/80 bg-slate-950/90 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="flex space-x-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
            </div>
            <Terminal className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
            <span className="text-slate-300 font-semibold text-[11px]">Telemetry Stream: {currentRunningCase || 'IDLE'}</span>
          </div>

          <div className="flex items-center space-x-3 text-[11px] text-slate-500">
            {isRunning && (
              <span className="flex items-center space-x-1 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>STREAMING</span>
              </span>
            )}
            <span>{steps.length} steps recorded</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 font-mono text-xs">
          {steps.length === 0 && !isRunning && (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
              <Terminal className="w-8 h-8 text-slate-800" />
              <p>Select configuration parameters above and click "Launch Attack" to stream live tool telemetry.</p>
              <p className="text-[11px] text-slate-700">All results will be deterministically judged and persisted to results.jsonl.</p>
            </div>
          )}

          {steps.map((st, i) => (
            <div
              key={i}
              className={`p-3 rounded border text-xs leading-relaxed ${
                st.role === 'tool'
                  ? 'bg-slate-900/90 border-slate-800 text-slate-300'
                  : 'bg-rose-950/15 border-rose-900/30 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between font-bold text-[10px] uppercase mb-1 opacity-70">
                <span className="flex items-center space-x-1">
                  {st.role === 'tool' ? (
                    <>
                      <Server className="w-3 h-3 text-cyan-400" />
                      <span className="text-cyan-300">Tool Executed: {st.tool_name}</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3 text-rose-400" />
                      <span className="text-rose-300">Agent Reasoning</span>
                    </>
                  )}
                </span>
                {st.tool_ok !== undefined && (
                  <span className={st.tool_ok ? 'text-emerald-400' : 'text-rose-400'}>
                    {st.tool_ok ? 'GATE: PASSED' : 'GATE: DENIED / BLOCKED'}
                  </span>
                )}
              </div>

              {st.content && <p className="whitespace-pre-wrap font-sans text-xs text-slate-200">{st.content}</p>}

              {st.tool_args && (
                <div className="mt-1 bg-slate-950/80 p-2 rounded text-[11px] text-slate-400 overflow-x-auto border border-slate-900">
                  <span className="text-slate-500 font-bold block text-[10px] mb-0.5">INPUT ARGS:</span>
                  <pre>{JSON.stringify(st.tool_args, null, 2)}</pre>
                </div>
              )}

              {st.tool_output && (
                <div className="mt-1 bg-slate-950/80 p-2 rounded text-[11px] text-slate-400 overflow-x-auto max-h-28 border border-slate-900">
                  <span className="text-slate-500 font-bold block text-[10px] mb-0.5">OUTPUT DATA:</span>
                  <pre className="whitespace-pre-wrap">{st.tool_output}</pre>
                </div>
              )}
            </div>
          ))}

          {verdict && !isSweep && (
            <div
              className={`p-3.5 rounded-lg border mt-3 ${
                verdict.verdict === 'attack_success'
                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                  : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold text-sm mb-1.5">
                {verdict.verdict === 'attack_success' ? (
                  <>
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>FORENSIC VERDICT: ATTACK SUCCEEDED (VULNERABLE)</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>FORENSIC VERDICT: ATTACK RESISTED (COMPLIANT)</span>
                  </>
                )}
              </div>
              <div className="text-[11px] text-slate-400 uppercase font-mono tracking-wider font-semibold mb-1">
                Deterministic Evidence:
              </div>
              <ul className="text-xs list-disc list-inside space-y-0.5 font-sans">
                {verdict.evidence.map((ev, i) => (
                  <li key={i}>{ev}</li>
                ))}
              </ul>
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>
      </div>
    </div>
  );
};
