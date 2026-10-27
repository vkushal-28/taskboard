import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <Link to="/" className="font-medium text-indigo-600 hover:text-indigo-500">
        Back to your boards
      </Link>
    </main>
  );
}
