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
    <header className="h-14 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 flex-shrink-0">
      <div className="flex items-center space-x-3 min-w-0">
        <span className="hidden sm:flex items-center space-x-1.5 text-xs font-mono font-bold px-2.5 py-1 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 tracking-wider whitespace-nowrap">
          OWASP LLM01 · ASI01
        </span>
        <span className="text-slate-600 hidden sm:block">·</span>
        <h2 className="text-xs sm:text-sm text-slate-200 font-semibold truncate">
          Indirect Prompt Injection &amp; Tool Misuse Harness
        </h2>
      </div>

      <div className="flex items-center space-x-2.5 flex-shrink-0">
        {/* Unified 60s Auto-Sync & Manual Refresh Button */}
        <button
          onClick={() => {
            setCountdown(60);
            triggerGlobalSync();
          }}
          disabled={isSyncing}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-xs sm:text-sm font-mono text-slate-200 font-medium transition group cursor-pointer shadow-sm"
          title="Auto-syncs ledger every 60s. Click to sync immediately."
        >
          <RefreshCw
            className={`w-4 h-4 text-rose-400 ${
              isSyncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-300'
            }`}
          />
          <span className="text-xs font-bold text-slate-100 hidden sm:inline">
            {isSyncing ? 'Syncing...' : `Sync (${countdown}s)`}
          </span>
        </button>

        {/* API Status */}
        <div className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border text-xs font-mono font-semibold ${
          health?.status === 'ok'
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
        }`}>
          {health?.status === 'ok' ? (
            <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /><span className="hidden sm:inline">API Online</span></>
          ) : (
            <><Activity className="w-3.5 h-3.5 text-amber-400" /><span className="hidden sm:inline">Connecting...</span></>
          )}
        </div>

        {/* Ollama Local Status */}
        <div className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border text-xs font-mono font-semibold ${
          health?.ollama_reachable
            ? 'bg-sky-500/15 border-sky-500/30 text-sky-300'
            : 'bg-slate-800/80 border-slate-700 text-slate-300'
        }`}>
          <Server className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {health?.ollama_reachable ? 'Ollama Online' : 'Ollama Offline'}
          </span>
        </div>

        {/* Groq badge */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono text-xs font-semibold">
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden sm:inline">Groq</span>
        </div>
      </div>
    </header>
  );
};
