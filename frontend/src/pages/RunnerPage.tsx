import { useState, useRef, useEffect } from 'react';
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
  const [steps, setSteps] = useState<TranscriptStep[]>([]);
  const [verdict, setVerdict] = useState<{ verdict: string; evidence: string[]; final_answer?: string } | null>(null);
  const [providerInfo, setProviderInfo] = useState<{ provider: string; model: string } | null>(null);

  // Sweep state
  const [sweepProgress, setSweepProgress] = useState<{ current: number; total: number; currentCase: string } | null>(null);
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
    setSweepProgress(null);
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
          case 'step':
            setSteps(prev => [...prev, data.step as TranscriptStep]);
            break;
          case 'verdict':
            setVerdict({ verdict: data.verdict as string, evidence: (data.evidence as string[]) || [], final_answer: data.final_answer as string | undefined });
            break;
          case 'sweep_start':
            setSweepProgress({ current: 0, total: data.total as number, currentCase: '' });
            break;
          case 'case_start':
            setSweepProgress(prev => prev ? { ...prev, current: data.index as number, currentCase: data.case_id as string } : null);
            setSteps([]);
            setVerdict(null);
            break;
          case 'case_complete':
            setSweepResults(prev => [...prev, { case_id: data.case_id as string, verdict: data.verdict as string, evidence: (data.evidence as string[]) || [] }]);
            break;
          case 'sweep_complete':
            setIsRunning(false);
            ws.close();
            break;
          case 'complete':
            setIsRunning(false);
            ws.close();
            break;
          case 'error':
            alert(`Error: ${data.message as string}`);
            setIsRunning(false);
            ws.close();
            break;
        }
      } catch (err) {
        console.error(err);
      }
    };

    ws.onerror = () => setIsRunning(false);
    ws.onclose = () => setIsRunning(false);
  };

  const isSweep = sweepMode !== 'single';
  const sweepSuccesses = sweepResults.filter(r => r.verdict === 'attack_success').length;
  const sweepASR = sweepResults.length > 0 ? Math.round(100 * sweepSuccesses / sweepResults.length) : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      <div className="flex items-start justify-between flex-shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Live Red-Team Runner</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">Execute real-time indirect prompt injection attacks with live streaming transcripts.</p>
        </div>
        {providerInfo && (
          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 font-mono text-xs flex-shrink-0">
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            <span>{providerInfo.provider}</span>
          </div>
        )}
      </div>

      {/* Mode selector */}
      <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-1 text-xs font-mono self-start flex-shrink-0">
        {(['single', 'category', 'full'] as SweepMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setSweepMode(mode)}
            disabled={isRunning}
            className={`px-3.5 py-1.5 rounded-md font-medium transition ${
              sweepMode === mode ? 'bg-rose-500/20 text-rose-300 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {mode === 'single' ? 'Single Case' : mode === 'category' ? 'Category Sweep' : 'Full Suite (24)'}
          </button>
        ))}
      </div>

      {/* Control Panel */}
      <div className="p-4 sm:p-5 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end flex-shrink-0">
        <div>
          <label className="text-xs font-mono uppercase text-slate-400 block mb-1.5">Model Under Test</label>
          <select value={model} onChange={e => setModel(e.target.value)} disabled={isRunning}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500 disabled:opacity-50">
            <optgroup label="Groq Frontier">
              <option value="gq/openai/gpt-oss-120b">gpt-oss-120b (Primary)</option>
              <option value="gq/qwen/qwen3.8-27b">qwen3.8-27b (Comparison)</option>
              <option value="gq/openai/gpt-oss-20b">gpt-oss-20b (Baseline)</option>
              <option value="gq/meta-llama/llama-prompt-guard-2-86m">llama-prompt-guard-2-86m</option>
            </optgroup>
            <optgroup label="Local Ollama">
              <option value="qwen2.5:3b">qwen2.5:3b</option>
              <option value="llama3.2:3b">llama3.2:3b</option>
            </optgroup>
          </select>
        </div>

        {sweepMode === 'single' ? (
          <div>
            <label className="text-xs font-mono uppercase text-slate-400 block mb-1.5">Attack Case</label>
            <select value={caseId} onChange={e => setCaseId(e.target.value)} disabled={isRunning}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500 disabled:opacity-50">
              {['DIR-01','DIR-02','DIR-03','DIR-04','DIR-05',
                'FILE-01','FILE-02','FILE-03','FILE-04','FILE-05','FILE-06','FILE-07','FILE-08','FILE-09',
                'URL-01','URL-02','URL-03','URL-04','URL-05','URL-06',
                'AUTH-01','AUTH-02','AUTH-03','AUTH-04'].map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
        ) : sweepMode === 'category' ? (
          <div>
            <label className="text-xs font-mono uppercase text-slate-400 block mb-1.5">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} disabled={isRunning}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500 disabled:opacity-50">
              <option value="DIR">DIR (5 cases) — Direct Override</option>
              <option value="FILE">FILE (9 cases) — File Injection</option>
              <option value="URL">URL (6 cases) — Web Injection</option>
              <option value="AUTH">AUTH (4 cases) — Auth Escalation</option>
            </select>
          </div>
        ) : (
          <div className="flex items-end">
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono">
              All 24 cases will run sequentially with 2.5s delay between Groq calls
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-mono uppercase text-slate-400 block mb-1.5">Defense</label>
          <select value={defense} onChange={e => setDefense(e.target.value)} disabled={isRunning}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500 disabled:opacity-50">
            <option value="none">Baseline (Vulnerable)</option>
            <option value="v1">Defense v1 (Gate)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-mono uppercase text-slate-400 block mb-1.5">Agent</label>
          <select value={agentVersion} onChange={e => setAgentVersion(e.target.value as 'v1' | 'langgraph')} disabled={isRunning}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500 disabled:opacity-50">
            <option value="langgraph">LangGraph</option>
            <option value="v1">v1 (Hand-rolled)</option>
          </select>
        </div>

        <button onClick={runAttack} disabled={isRunning}
          className="h-10 px-5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center space-x-2 transition font-mono">
          {isRunning
            ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>Running...</span></>
            : <><Play className="w-4 h-4 fill-white" /><span>{isSweep ? 'Start Sweep' : 'Launch'}</span></>
          }
        </button>
      </div>

      {/* Sweep progress bar */}
      {isSweep && sweepProgress && (
        <div className="flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>Sweep: {sweepProgress.currentCase || 'Starting...'}</span>
            <span>{sweepProgress.current}/{sweepProgress.total} cases{sweepASR !== null ? ` · ASR: ${sweepASR}%` : ''}</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-rose-500 rounded-full transition-all"
              style={{ width: `${sweepProgress.total > 0 ? (sweepProgress.current / sweepProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Sweep results summary */}
      {isSweep && sweepResults.length > 0 && (
        <div className="flex-shrink-0 p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-xs font-mono text-slate-400 mb-2 font-bold uppercase">Sweep Results ({sweepResults.length} completed)</div>
          <div className="flex flex-wrap gap-2">
            {sweepResults.map(r => (
              <div key={r.case_id} className={`px-2.5 py-1 rounded text-xs font-mono font-bold border ${
                r.verdict === 'attack_success' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                r.verdict === 'miss' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                'bg-amber-500/20 text-amber-400 border-amber-500/30'
              }`}>
                {r.case_id}: {r.verdict === 'attack_success' ? '✗ PWNED' : r.verdict === 'miss' ? '✓ SAFE' : '⚠ ERR'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Terminal */}
      <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 flex flex-col overflow-hidden font-mono text-sm min-h-0">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="flex space-x-1.5">
              <div className="w-3 h-3 rounded-full bg-rose-500/60" />
              <div className="w-3 h-3 rounded-full bg-amber-500/60" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
            </div>
            <Terminal className="w-3.5 h-3.5 text-slate-500 ml-2" />
            <span className="text-xs font-bold text-slate-400">Live Agent Transcript</span>
          </div>
          <div className="flex items-center space-x-3 text-xs text-slate-500">
            {isRunning && (
              <div className="flex items-center space-x-1">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                <span>LIVE</span>
              </div>
            )}
            <span>{steps.length} steps</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2.5 p-4">
          {steps.length === 0 && !isRunning && (
            <div className="h-full flex items-center justify-center text-slate-600 text-sm">
              Configure attack above and click Launch to observe streaming tool calls.
            </div>
          )}

          {steps.map((st, i) => (
            <div key={i} className={`p-3 rounded-lg border ${
              st.role === 'tool'
                ? 'bg-slate-900/80 border-slate-800 text-slate-300'
                : 'bg-rose-950/15 border-rose-900/20 text-rose-200'
            }`}>
              <div className="flex items-center justify-between text-[11px] font-semibold mb-1 opacity-70">
                <span className="uppercase flex items-center space-x-1">
                  {st.role === 'tool'
                    ? <><Server className="w-3 h-3" /><span>Tool: {st.tool_name}</span></>
                    : <><Zap className="w-3 h-3" /><span>Agent</span></>
                  }
                </span>
                {st.tool_ok !== undefined && st.tool_ok !== null && (
                  <span className={st.tool_ok ? 'text-emerald-400' : 'text-rose-400'}>
                    {st.tool_ok ? '✓ OK' : '✗ BLOCKED'}
                  </span>
                )}
              </div>
              {st.content && <p className="whitespace-pre-wrap text-xs sm:text-sm">{st.content}</p>}
              {st.tool_args && (
                <pre className="text-[11px] text-slate-400 mt-1.5 bg-slate-950/60 p-2 rounded overflow-x-auto">args: {JSON.stringify(st.tool_args, null, 2)}</pre>
              )}
              {st.tool_output && (
                <pre className="text-[11px] text-slate-400 mt-1.5 bg-slate-950/60 p-2 rounded overflow-x-auto max-h-24">{st.tool_output}</pre>
              )}
            </div>
          ))}

          {verdict && !isSweep && (
            <div className={`p-4 rounded-xl border mt-3 ${
              verdict.verdict === 'attack_success'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}>
              <div className="flex items-center space-x-2 font-bold text-sm mb-2">
                {verdict.verdict === 'attack_success'
                  ? <><XCircle className="w-5 h-5 text-rose-400" /><span>ATTACK SUCCEEDED — Unauthorized Action / Data Leak</span></>
                  : <><CheckCircle2 className="w-5 h-5 text-emerald-400" /><span>ATTACK RESISTED</span></>
                }
              </div>
              <ul className="text-xs list-disc list-inside space-y-0.5 opacity-90">
                {verdict.evidence.map((ev, i) => <li key={i}>{ev}</li>)}
              </ul>
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>
      </div>
    </div>
  );
};
