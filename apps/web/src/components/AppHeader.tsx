import { useEffect, useRef, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useAuth, useLogout } from '../features/auth/api';
import { Avatar } from './Avatar';

interface AppHeaderProps {
  /** Page-specific search box; only My boards has one for now. */
  search?: ReactNode;
  /** Span the whole window, to line up with a full-width page such as the board. */
  fullWidth?: boolean;
}

export function AppHeader({ search, fullWidth = false }: AppHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div
        className={`flex h-14 items-center gap-4 px-4 sm:gap-6 sm:px-6 ${fullWidth ? '' : 'mx-auto max-w-7xl'}`}
      >
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500 text-sm font-bold text-white">
            T
          </span>
          <span className="font-semibold text-slate-900">Taskboard</span>
        </Link>
        <nav className="hidden sm:block">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 text-sm font-medium ${
                isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`
            }
          >
            Boards
          </NavLink>
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4">
          {search}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

// <details> gives an accessible open/close toggle without any menu state or library.
function UserMenu() {
  const { user } = useAuth();
  const logout = useLogout();
  const menu = useRef<HTMLDetailsElement>(null);

  // <details> doesn't close on Escape or an outside click by itself.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const details = menu.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    }
    function onKeyDown(event: KeyboardEvent) {
      const details = menu.current;
      if (event.key !== 'Escape' || !details?.open) return;
      details.open = false;
      details.querySelector('summary')?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (!user) return null;

  return (
    <details ref={menu} className="relative">
      <summary
        aria-label="Account menu"
        className="cursor-pointer list-none rounded-full focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none"
      >
        <Avatar id={user.id} name={user.name} />
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
        >
          Sign out
        </button>
      </div>
    </details>
  );
}
