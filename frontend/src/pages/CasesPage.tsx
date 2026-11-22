import { useEffect, useState } from 'react';
import { fetchCases } from '../lib/api';
import type { Case } from '../types';
import { Search, ChevronDown, ChevronRight, FileText, Globe, User } from 'lucide-react';

export const CasesPage: React.FC = () => {
  const [cases, setCases] = useState<Case[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchCases().then(setCases).catch(console.error);
  }, []);

  const filtered = cases.filter((c) => {
    const matchCat = categoryFilter === 'ALL' || c.category === categoryFilter;
    const matchSearch =
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.user_task.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const getDeliveryIcon = (delivery: string) => {
    switch (delivery) {
      case 'file':
        return <FileText className="w-3.5 h-3.5 text-blue-400" />;
      case 'url':
        return <Globe className="w-3.5 h-3.5 text-teal-400" />;
      default:
        return <User className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  const getCategoryBadge = (cat: string) => {
    const styles: Record<string, string> = {
      DIR: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      FILE: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      URL: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
      AUTH: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${styles[cat] || ''}`}>
        {cat}
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">24-Case Attack Corpus</h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 font-medium">
            Standardized, strictly validated prompt-injection benchmark covering 4 delivery categories.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search test cases..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-rose-500 font-mono shadow-sm"
            />
          </div>

          <div className="flex rounded-lg bg-slate-900 border border-slate-700 p-1 text-xs font-mono shadow-sm">
            {['ALL', 'DIR', 'FILE', 'URL', 'AUTH'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 rounded font-semibold transition ${
                  categoryFilter === cat ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30' : 'text-slate-300 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Case List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800 overflow-hidden shadow-sm">
        {filtered.map((c) => {
          const isExpanded = expandedId === c.id;
          return (
            <div key={c.id} className="transition hover:bg-slate-800/40">
              <div
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                className="p-4 flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center space-x-4">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-300" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                  {getCategoryBadge(c.category)}
                  <span className="font-mono font-extrabold text-white text-sm">{c.id}</span>
                  <div className="flex items-center space-x-1.5 text-xs text-slate-300 font-mono font-medium">
                    {getDeliveryIcon(c.delivery)}
                    <span>{c.delivery}</span>
                  </div>
                  <span className="text-sm text-slate-100 font-semibold">{c.description}</span>
                </div>

                <div className="flex items-center space-x-2">
                  {c.answer_leak && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold">
                      answer_leak
                    </span>
                  )}
                  {Object.keys(c.seed_files || {}).length > 0 && (
                    <span className="text-xs text-slate-300 font-mono font-medium">
                      {Object.keys(c.seed_files).length} seed file(s)
                    </span>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="px-12 pb-5 pt-2 border-t border-slate-800 bg-slate-950/60 space-y-4">
                  <div>
                    <h4 className="text-xs font-mono uppercase text-slate-300 font-bold mb-1.5">User Task Given To Agent:</h4>
                    <pre className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-xs sm:text-sm text-slate-100 font-mono whitespace-pre-wrap">
                      {c.user_task}
                    </pre>
                  </div>

                  {c.payload && (
                    <div>
                      <h4 className="text-xs font-mono uppercase text-rose-400 font-bold mb-1.5">Injected Malicious Payload:</h4>
                      <pre className="p-3.5 rounded-lg bg-rose-950/25 border border-rose-900/40 text-xs sm:text-sm text-rose-200 font-mono whitespace-pre-wrap">
                        {c.payload}
                      </pre>
                    </div>
                  )}

                  {Object.keys(c.seed_files || {}).length > 0 && (
                    <div>
                      <h4 className="text-xs font-mono uppercase text-slate-300 font-bold mb-1.5">Seeded Enterprise Documents:</h4>
                      <div className="space-y-2">
                        {Object.entries(c.seed_files).map(([path, content]) => (
                          <div key={path} className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
                            <div className="px-3.5 py-1.5 bg-slate-800/70 border-b border-slate-800 text-xs font-mono text-slate-200 font-semibold">
                              {path}
                            </div>
                            <pre className="p-3.5 text-xs sm:text-sm text-slate-200 font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
                              {String(content)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
