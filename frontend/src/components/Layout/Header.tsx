import { Sparkles, CheckCircle2 } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur px-8 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center space-x-3">
        <span className="text-xs font-semibold uppercase px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 tracking-wider">
          OWASP LLM01 / Agentic ASI01
        </span>
        <span className="text-slate-500">•</span>
        <h2 className="text-sm text-slate-300 font-medium">
          Indirect Prompt Injection & Tool Misuse Harness
        </h2>
      </div>

      <div className="flex items-center space-x-3 text-xs">
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Deterministic Judge Active</span>
        </div>
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 font-mono">
          <Sparkles className="w-3.5 h-3.5" />
          <span>LangGraph Ready</span>
        </div>
      </div>
    </header>
  );
};
