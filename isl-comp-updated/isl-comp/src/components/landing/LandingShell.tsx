import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageCircle, Play } from 'lucide-react';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/room', label: 'Communication room' },
  { to: '/daily', label: 'Daily Translator' },
];

const TEAM = ['Hriday', 'Anshu', 'Arnav', 'Aayush'];

import { DotField } from './DotField';

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className="landing relative min-h-screen overflow-hidden bg-night font-dm text-cream">
      <DotField />
      
      
      

      <LandingNav />
      <main className="relative">{children}</main>

      <footer className="relative border-t border-white/[0.08]">
        <div className="mx-auto grid max-w-[1312px] gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-16">
          <div>
            <Link to="/" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-saffron text-[#0e1116]">
                <MessageCircle size={20} strokeWidth={2.2} />
              </span>
              <span className="font-bricolage text-xl font-bold tracking-tight text-cream">
                Samvaad
              </span>
              <span className="font-deva text-base text-saffron">संवाद</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-mist">
              Two languages. One conversation. Real-time communication between Indian Sign
              Language users and hearing users.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream">Explore</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-mist transition-colors hover:text-saffron">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream">Built by</p>
            <ul className="mt-4 space-y-2.5 text-sm text-mist">
              {TEAM.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1312px] flex-wrap justify-between gap-3 border-t border-white/[0.08] px-6 py-6 text-sm text-mist lg:px-16">
          <span>© SAMVAAD · संवाद, meaning “dialogue”</span>
          <span>Indian Sign Language, in real time</span>
        </div>
      </footer>
    </div>
  );
}

function LandingNav() {
  const { pathname } = useLocation();

  return (
    <header className="relative z-30 mx-auto grid max-w-[1312px] grid-cols-[1fr_auto] items-center px-6 py-6 sm:grid-cols-[1fr_auto_1fr] lg:px-16">
      <Link to="/" className="flex items-center gap-3">
        <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[13px] bg-saffron text-[#0e1116] shadow-[0_8px_28px_rgba(143,164,196,0.35)]">
          <MessageCircle size={22} strokeWidth={2.2} />
        </span>
        <span className="font-bricolage text-2xl font-bold tracking-tight text-cream">
          Samvaad
        </span>
        <span className="font-deva text-lg text-saffron">संवाद</span>
      </Link>

      <nav className="hidden gap-1.5 rounded-full border border-white/10 bg-white/5 p-1.5 backdrop-blur-xl sm:flex">
        {NAV_LINKS.map((link) => {
          const active = pathname === link.to;
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`rounded-full px-[18px] py-2 text-sm transition-colors hover:bg-white/[0.08] ${
                active ? 'bg-white/10 text-cream' : 'text-[#a8abb1] hover:text-cream'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center justify-end gap-2.5">
        <Link
          to="/#live-demo"
          onClick={(e) => {
            const el = document.getElementById('live-demo');
            if (pathname === '/' && el) {
              e.preventDefault();
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-saffron/40 bg-saffron/10 px-4 text-sm font-semibold text-saffron transition-transform hover:-translate-y-0.5"
        >
          <Play size={12} fill="currentColor" /> Live demo
        </Link>
        <Link
          to="/room"
          className="inline-flex min-h-[44px] items-center rounded-full border border-white/20 bg-white/[0.04] px-[22px] text-[15px] font-semibold text-cream transition-transform hover:-translate-y-0.5"
        >
          Launch app
        </Link>
      </div>
    </header>
  );
}