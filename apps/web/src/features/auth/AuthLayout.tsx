import type { ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}

const HIGHLIGHTS = [
  'Drag cards across lists and everyone sees it live',
  'Owner, member and viewer roles on every board',
  'Checklists, due dates, comments and activity',
];

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-slate-900 p-12 text-white lg:flex">
        <Logo />
        <div>
          <h2 className="text-4xl leading-tight font-semibold">
            Plan together.
            <br />
            <span className="text-indigo-400">Ship together.</span>
          </h2>
          <ul className="mt-8 space-y-3 text-slate-300">
            {HIGHLIGHTS.map((highlight) => (
              <li key={highlight} className="flex items-start gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                {highlight}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-slate-500">Real-time Kanban for small teams.</p>
      </aside>

      <main className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo dark />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 font-bold text-white">
        T
      </span>
      <span className={`text-lg font-semibold ${dark ? 'text-slate-900' : 'text-white'}`}>
        Taskboard
      </span>
    </div>
  );
}
