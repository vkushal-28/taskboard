export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
