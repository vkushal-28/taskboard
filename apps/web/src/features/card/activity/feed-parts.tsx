import { Avatar } from '../../../components/Avatar';

/**
 * The avatar of whoever wrote a comment or made a change; a grey circle if their account is gone.
 */
export function ActorAvatar({ actor }: { actor: { id: string; name: string } | null }) {
  return actor ? (
    <Avatar id={actor.id} name={actor.name} size="sm" />
  ) : (
    <span className="h-6 w-6 shrink-0 rounded-full bg-slate-200" />
  );
}

/** The "Load older…" button under a paged feed. */
export function LoadOlder({
  label,
  loading,
  onLoad,
}: {
  label: string;
  loading: boolean;
  onLoad: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onLoad}
      disabled={loading}
      className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-60"
    >
      {loading ? 'Loading…' : label}
    </button>
  );
}
