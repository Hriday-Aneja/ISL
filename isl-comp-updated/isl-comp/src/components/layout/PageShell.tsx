import type { ReactNode } from 'react';
import { Navbar } from './Navbar';

export function PageShell({
  children,
  fullBleed = false,
}: {
  children: ReactNode;
  fullBleed?: boolean;
}) {
  return (
    <div className="min-h-screen bg-paper">
      <Navbar />
      <main className={fullBleed ? '' : 'mx-auto max-w-6xl px-6'}>{children}</main>
    </div>
  );
}
