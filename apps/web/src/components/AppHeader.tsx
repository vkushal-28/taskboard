import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useAuth, useLogout } from '../features/auth/api';
import { Avatar } from './Avatar';

interface AppHeaderProps {
  /** Page-specific search box; only My boards has one for now. */
  search?: ReactNode;
}

export function AppHeader({ search }: AppHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
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
        <div className="ml-auto flex items-center gap-4">
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
  if (!user) return null;

  return (
    <details className="relative">
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
