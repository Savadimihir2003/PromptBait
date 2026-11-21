import { useState } from 'react';
import { Sidebar } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { DashboardPage } from './pages/DashboardPage';
import { CasesPage } from './pages/CasesPage';
import { RunnerPage } from './pages/RunnerPage';
import { ReplayPage } from './pages/ReplayPage';
import { ReportsPage } from './pages/ReportsPage';

export function App() {
  const [tab, setTab] = useState('dashboard');

  return (
    <div className="flex bg-slate-950 text-slate-100 min-h-screen">
      <Sidebar currentTab={tab} onSelectTab={setTab} />
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
