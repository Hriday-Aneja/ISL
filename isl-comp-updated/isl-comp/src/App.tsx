import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { CommunicationRoom } from './pages/CommunicationRoom';
import { HowItWorks } from './pages/HowItWorks';
import { DailyTranslator } from './pages/DailyTranslator';
import { DailyDomainPage } from './pages/DailyDomainPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room" element={<CommunicationRoom />} />
        <Route path="/room/:roomId" element={<CommunicationRoom />} />
        <Route path="/daily" element={<DailyTranslator />} />
        <Route path="/daily/:scenarioId" element={<DailyDomainPage />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
      </Routes>
    </BrowserRouter>
  );
}
