import { useState, useRef, useEffect } from 'react';
import { Play, Terminal, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import type { TranscriptStep } from '../types';

export const RunnerPage: React.FC = () => {
  const [model, setModel] = useState('gq/openai/gpt-oss-120b');
  const [caseId, setCaseId] = useState('DIR-01');
  const [defense, setDefense] = useState('none');
  const [agentVersion, setAgentVersion] = useState<'v1' | 'langgraph'>('langgraph');
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<TranscriptStep[]>([]);
  const [verdict, setVerdict] = useState<{ verdict: string; evidence: string[]; final_answer?: string } | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps, verdict]);

  const runAttack = () => {
    setIsRunning(true);
    setSteps([]);
    setVerdict(null);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/run`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          model,
          case_id: caseId,
          defense,
          agent_version: agentVersion,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'step') {
          setSteps((prev) => [...prev, data.step]);
        } else if (data.type === 'verdict') {
          setVerdict({
            verdict: data.verdict,
            evidence: data.evidence || [],
            final_answer: data.final_answer,
          });
        } else if (data.type === 'complete') {
          setIsRunning(false);
          ws.close();
        } else if (data.type === 'error') {
          alert(`Error: ${data.message}`);
          setIsRunning(false);
          ws.close();
        }
      } catch (err) {
        console.error(err);
      }
    };

    ws.onerror = () => {
      setIsRunning(false);
    };

    ws.onclose = () => {
      setIsRunning(false);
    };
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Live Red-Team Runner</h2>
          <p className="text-sm text-slate-400 mt-1">
            Execute real-time indirect prompt injection attacks with live streaming transcripts.
          </p>
        </div>
      </div>

      {/* Control Panel */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
        <div>
          <label className="text-xs font-mono uppercase text-slate-400 block mb-1.5">Model Under Test</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isRunning}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-rose-500"
          >
            <option value="gq/openai/gpt-oss-120b">gq/openai/gpt-oss-120b (Primary frontier)</option>
            <option value="gq/qwen/qwen3.8-27b">gq/qwen/qwen3.8-27b (Comparison frontier)</option>
            <option value="gq/openai/gpt-oss-20b">gq/openai/gpt-oss-20b (Baseline comparison)</option>
            <option value="qwen2.5:3b">qwen2.5:3b (Local Ollama)</option>
            <option value="llama3.2:3b">llama3.2:3b (Local Ollama)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-mono uppercase text-slate-400 block mb-1.5">Attack Case</label>
          <select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            disabled={isRunning}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-rose-500"
          >
            <option value="DIR-01">DIR-01 (Direct Override)</option>
            <option value="DIR-04">DIR-04 (Fake Developer Auth)</option>
            <option value="FILE-01">FILE-01 (Poisoned Setup Readme)</option>
            <option value="FILE-06">FILE-06 (Migration Credential Leak)</option>
            <option value="URL-01">URL-01 (Hidden CSS Web Injection)</option>
            <option value="AUTH-01">AUTH-01 (Multi-Channel Exfil)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-mono uppercase text-slate-400 block mb-1.5">Agent Pipeline</label>
          <select
            value={agentVersion}
            onChange={(e) => setAgentVersion(e.target.value as any)}
            disabled={isRunning}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-rose-500"
          >
            <option value="langgraph">LangGraph StateGraph (v2)</option>
            <option value="v1">Hand-Rolled Loop (v1)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-mono uppercase text-slate-400 block mb-1.5">Defense Configuration</label>
          <select
            value={defense}
            onChange={(e) => setDefense(e.target.value)}
            disabled={isRunning}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-rose-500"
          >
            <option value="none">Baseline (Vulnerable)</option>
            <option value="v1">Defense v1 (Hierarchy + Gate)</option>
          </select>
        </div>

        <button
          onClick={runAttack}
          disabled={isRunning}
          className="h-10 px-5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center space-x-2 transition font-mono tracking-wide"
        >
          {isRunning ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Running...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>Launch Attack</span>
            </>
          )}
        </button>
      </div>

      {/* Streaming Console Terminal */}
      <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 p-6 flex flex-col overflow-hidden font-mono text-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs text-slate-500 uppercase">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-rose-500" />
            <span className="font-bold text-slate-300">Live Agent Transcript Execution</span>
          </div>
          <span className="text-slate-500">{steps.length} Steps Flushed</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3.5 py-4 pr-2">
          {steps.length === 0 && !isRunning && (
            <div className="h-full flex items-center justify-center text-slate-600">
              Select configuration above and click "Launch Attack" to observe streaming tool calls.
            </div>
          )}

          {steps.map((st, i) => (
            <div
              key={i}
              className={`p-3.5 rounded-lg border ${
                st.role === 'tool'
                  ? 'bg-slate-900 border-slate-800 text-slate-300'
                  : 'bg-rose-950/20 border-rose-900/30 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold mb-1 opacity-70">
                <span className="uppercase">{st.role === 'tool' ? `Tool Call: ${st.tool_name}` : 'Agent Assistant'}</span>
                {st.tool_ok !== undefined && (
                  <span className={st.tool_ok ? 'text-emerald-400' : 'text-rose-400'}>
                    {st.tool_ok ? 'Status: OK' : 'Status: FAILED / GATED'}
                  </span>
                )}
              </div>
              {st.content && <p className="whitespace-pre-wrap">{st.content}</p>}
              {st.tool_args && (
                <pre className="text-xs text-slate-400 mt-1 bg-slate-950/80 p-2 rounded">
                  args: {JSON.stringify(st.tool_args, null, 2)}
                </pre>
              )}
              {st.tool_output && (
                <pre className="text-xs text-slate-400 mt-1 bg-slate-950/80 p-2 rounded overflow-x-auto max-h-32">
                  output: {st.tool_output}
                </pre>
              )}
            </div>
          ))}

          {verdict && (
            <div
              className={`p-4 rounded-xl border mt-4 ${
                verdict.verdict === 'attack_success'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold text-base mb-1">
                {verdict.verdict === 'attack_success' ? (
                  <>
                    <XCircle className="w-5 h-5 text-rose-400" />
                    <span>Attack Successful (Data Exfiltration / Unauthorized State Change)</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span>Attack Resisted (Miss)</span>
                  </>
                )}
              </div>
              <ul className="text-xs list-disc list-inside mt-2 space-y-1 opacity-90">
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
