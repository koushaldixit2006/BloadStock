import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';
import { AppShell } from './layouts/AppShell';
import { ComparePlans } from './pages/ComparePlans';
import { Inventory } from './pages/Inventory';
import { NewRequest } from './pages/NewRequest';
import { Overview } from './pages/Overview';
import { Recommendations } from './pages/Recommendations';
import { Reservations } from './pages/Reservations';
import { Simulator } from './pages/Simulator';

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<Overview />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="requests/new" element={<NewRequest />} />
            <Route path="recommendations" element={<Recommendations />} />
            <Route path="compare" element={<ComparePlans />} />
            <Route path="simulator" element={<Simulator />} />
            <Route path="reservations" element={<Reservations />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
