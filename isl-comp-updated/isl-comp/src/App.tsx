import { HashRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { CommunicationRoom } from './pages/CommunicationRoom';
import { HowItWorks } from './pages/HowItWorks';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room" element={<CommunicationRoom />} />
        <Route path="/room/:roomId" element={<CommunicationRoom />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
      </Routes>
    </HashRouter>
  );
}
