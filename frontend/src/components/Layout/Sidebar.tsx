import React, { useState } from 'react';
import { ShieldAlert, BookOpen, PlayCircle, BarChart3, Terminal, FileCode, Menu, X } from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Evaluation Dashboard', icon: BarChart3, description: 'ASR metrics & analysis' },
  { id: 'cases', label: 'Attack Corpus', icon: BookOpen, description: '24 injection test cases', badge: '24' },
  { id: 'runner', label: 'Live Red-Team Runner', icon: PlayCircle, description: 'Stream attack executions', badge: 'LIVE' },
  { id: 'replay', label: 'Evidence & Replay', icon: Terminal, description: 'Forensic audit trails' },
  { id: 'reports', label: 'Reports & Config', icon: FileCode, description: 'Findings & system setup' },
];

const NavContent: React.FC<{ currentTab: string; onSelectTab: (tab: string) => void; onClose?: () => void }> = ({ currentTab, onSelectTab, onClose }) => (
  <>
    <div className="p-5 border-b border-slate-800/80">
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
          <ShieldAlert className="w-5 h-5 text-rose-400" />
        </div>
        <div>
          <h1 className="font-bold text-base tracking-wide text-white">PromptBait</h1>
          <p className="text-[11px] text-slate-500 font-mono">Agent Security Lab v2</p>
        </div>
      </div>
    </div>

    <nav className="p-3 space-y-0.5 flex-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = currentTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => { onSelectTab(item.id); onClose?.(); }}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm transition-all group relative ${
              active
                ? 'bg-rose-500/10 text-white border border-rose-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-rose-500 rounded-r-full" />}
            <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-rose-400' : 'text-slate-500 group-hover:text-slate-400'}`} />
            <div className="flex-1 text-left min-w-0">
              <div className={`font-medium text-sm truncate ${active ? 'text-white' : ''}`}>{item.label}</div>
              <div className="text-[11px] text-slate-500 truncate">{item.description}</div>
            </div>
            {item.badge && (
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                item.badge === 'LIVE' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-800 text-slate-400'
              }`}>{item.badge}</span>
            )}
          </button>
        );
      })}
    </nav>

    <div className="p-4 border-t border-slate-800/60 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">Framework</span>
        <span className="text-emerald-400 font-mono">LangGraph</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">Judge</span>
        <span className="text-rose-400 font-mono">Deterministic</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">Corpus</span>
        <span className="text-slate-300 font-mono">24 cases · 4 categories</span>
      </div>
    </div>
  </>
);

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full z-50">
            <div className="absolute top-4 right-4">
              <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <NavContent currentTab={currentTab} onSelectTab={onSelectTab} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-slate-900 border-r border-slate-800 flex-col h-screen sticky top-0 flex-shrink-0">
        <NavContent currentTab={currentTab} onSelectTab={onSelectTab} />
      </aside>
    </>
  );
};
