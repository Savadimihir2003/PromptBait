import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, Activity, Zap, Server, RefreshCw } from 'lucide-react';
import { fetchHealth } from '../../lib/api';

export const Header: React.FC = () => {
  const [health, setHealth] = useState<{ status: string; ollama_reachable: boolean } | null>(null);
  const [countdown, setCountdown] = useState<number>(60);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const triggerGlobalSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await fetchHealth()
        .then(setHealth)
        .catch(() => setHealth({ status: 'error', ollama_reachable: false }));
      window.dispatchEvent(new CustomEvent('promptbait:refresh'));
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  }, []);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth({ status: 'error', ollama_reachable: false }));

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          triggerGlobalSync();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [triggerGlobalSync]);

  return (
    <header className="h-14 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 flex-shrink-0">
      <div className="flex items-center space-x-3 min-w-0">
        <span className="hidden sm:flex items-center space-x-1.5 text-xs font-mono px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 tracking-wider whitespace-nowrap">
          OWASP LLM01 · ASI01
        </span>
        <span className="text-slate-600 hidden sm:block">·</span>
        <h2 className="text-xs sm:text-sm text-slate-400 font-medium truncate">
          Indirect Prompt Injection &amp; Tool Misuse Harness
        </h2>
      </div>

      <div className="flex items-center space-x-2 flex-shrink-0">
        {/* Unified 60s Auto-Sync & Manual Refresh Button */}
        <button
          onClick={() => {
            setCountdown(60);
            triggerGlobalSync();
          }}
          disabled={isSyncing}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800/90 hover:border-slate-700 text-xs font-mono text-slate-300 transition group cursor-pointer"
          title="Auto-syncs ledger every 60s. Click to sync immediately."
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-rose-400 ${
              isSyncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-300'
            }`}
          />
          <span className="text-[11px] font-medium hidden sm:inline">
            {isSyncing ? 'Syncing...' : `Sync (${countdown}s)`}
          </span>
        </button>

        {/* API Status */}
        <div className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border text-xs font-mono ${
          health?.status === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        }`}>
          {health?.status === 'ok' ? (
            <><CheckCircle2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">API Online</span></>
          ) : (
            <><Activity className="w-3.5 h-3.5" /><span className="hidden sm:inline">Connecting...</span></>
          )}
        </div>

        {/* Ollama Local Status */}
        <div className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border text-xs font-mono ${
          health?.ollama_reachable
            ? 'bg-sky-500/10 border-sky-500/20 text-sky-400'
            : 'bg-slate-800/50 border-slate-700/60 text-slate-400'
        }`}>
          <Server className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {health?.ollama_reachable ? 'Ollama Online' : 'Ollama Offline'}
          </span>
        </div>

        {/* Groq badge */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 font-mono text-xs">
          <Zap className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Groq</span>
        </div>
      </div>
    </header>
  );
};
