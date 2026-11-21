import React from 'react';
import { ShieldAlert, BookOpen, PlayCircle, BarChart3, Terminal, FileCode } from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const navItems = [
    { id: 'dashboard', label: 'Evaluation Dashboard', icon: BarChart3 },
    { id: 'cases', label: 'Attack Corpus (24)', icon: BookOpen },
    { id: 'runner', label: 'Live Red-Team Runner', icon: PlayCircle },
    { id: 'replay', label: 'Evidence & Replay', icon: Terminal },
    { id: 'reports', label: 'Reports & Config', icon: FileCode },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b border-slate-800 flex items-center space-x-3">
        <div className="w-9 h-9 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
          <ShieldAlert className="w-5 h-5 text-rose-500" />
        </div>
        <div>
          <h1 className="font-bold text-base tracking-wide text-white">PromptBait</h1>
          <p className="text-xs text-slate-400 font-mono">Agent Security Lab v2</p>
        </div>
      </div>

      <nav className="p-4 space-y-1.5 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-rose-400' : 'text-slate-500'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 text-xs text-slate-500">
        <div className="flex items-center justify-between mb-1">
          <span className="font-medium text-slate-400">Agent Framework</span>
          <span className="text-emerald-400 font-mono">LangGraph / v1</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-medium text-slate-400">Evaluation</span>
          <span className="text-rose-400 font-mono">Deterministic</span>
        </div>
      </div>
    </aside>
  );
};
