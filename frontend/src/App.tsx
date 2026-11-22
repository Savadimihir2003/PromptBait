import { useState, useEffect } from 'react';
import { Sidebar } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { DashboardPage } from './pages/DashboardPage';
import { CasesPage } from './pages/CasesPage';
import { RunnerPage } from './pages/RunnerPage';
import { ReplayPage } from './pages/ReplayPage';
import { ReportsPage } from './pages/ReportsPage';

const VALID_TABS = ['dashboard', 'cases', 'runner', 'replay', 'reports'];

function getInitialTab(): string {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace('#', '');
    if (VALID_TABS.includes(hash)) return hash;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t && VALID_TABS.includes(t)) return t;
  }
  return 'dashboard';
}

export function App() {
  const [tab, setTab] = useState(getInitialTab);

  const handleSelectTab = (newTab: string) => {
    setTab(newTab);
    if (typeof window !== 'undefined') {
      window.location.hash = newTab;
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (VALID_TABS.includes(hash)) {
        setTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className="flex bg-slate-950 text-slate-100 min-h-screen">
      <Sidebar currentTab={tab} onSelectTab={handleSelectTab} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto">
          {tab === 'dashboard' && <DashboardPage />}
          {tab === 'cases' && <CasesPage />}
          {tab === 'runner' && <RunnerPage />}
          {tab === 'replay' && <ReplayPage />}
          {tab === 'reports' && <ReportsPage />}
        </main>
      </div>
    </div>
  );
}

export default App;
