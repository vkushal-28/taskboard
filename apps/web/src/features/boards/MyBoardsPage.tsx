import { useAuth, useLogout } from '../auth/api';

// Placeholder until Slice 3.2 builds the real My boards page.
export function MyBoardsPage() {
  const { user } = useAuth();
  const logout = useLogout();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.name}</h1>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
      >
        Sign out
      </button>
    </main>
  );
}
