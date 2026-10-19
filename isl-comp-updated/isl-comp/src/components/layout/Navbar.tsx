import { Link, useLocation } from 'react-router-dom';
import { Hand } from 'lucide-react';

export function Navbar() {
  const location = useLocation();

  const linkClass = (path: string) =>
    `text-sm font-medium transition-colors ${
      location.pathname === path ? 'text-ink' : 'text-ink-soft hover:text-ink'
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-signal text-white">
            <Hand size={16} strokeWidth={2.25} />
          </span>
          <span className="font-display text-[17px] font-medium tracking-tight">
            SAMVAAD
          </span>
        </Link>

        <nav className="hidden items-center gap-8 sm:flex">
          <Link to="/" className={linkClass('/')}>
            Home
          </Link>
          <Link to="/how-it-works" className={linkClass('/how-it-works')}>
            How It Works
          </Link>
        </nav>

        <Link to="/room" className="btn-primary">
          Start Communication
        </Link>
      </div>
    </header>
  );
}
