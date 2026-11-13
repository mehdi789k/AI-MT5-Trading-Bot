import { useState } from 'react';
import { AppLayout, type PageId } from '@/components/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { PositionsPage } from '@/pages/PositionsPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { PredictionsPage } from '@/pages/PredictionsPage';
import { LearningPage } from '@/pages/LearningPage';
import { StrategiesPage } from '@/pages/StrategiesPage';

function App() {
  const [page, setPage] = useState<PageId>('dashboard');

  return (
    <AppLayout current={page} onNavigate={setPage}>
      {page === 'dashboard' && <DashboardPage />}
      {page === 'positions' && <PositionsPage />}
      {page === 'history' && <HistoryPage />}
      {page === 'settings' && <SettingsPage />}
      {page === 'predictions' && <PredictionsPage />}
      {page === 'learning' && <LearningPage />}
      {page === 'strategies' && <StrategiesPage />}
    </AppLayout>
  );
}

export default App;
