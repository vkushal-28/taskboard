import type { BoardSummary } from '@taskboard/shared';
import { Link } from 'react-router';
import { RoleBadge } from '../../components/RoleBadge';
import { formatRelative } from '../../lib/time';

export function BoardTile({ board }: { board: BoardSummary }) {
  return (
    <Link
      to={`/b/${board.id}`}
      className="group block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none"
    >
      {/* The color is a validated hex from the api, so an inline style is safe here. */}
      <div className="h-16" style={{ backgroundColor: board.color }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-medium text-slate-900 group-hover:text-indigo-700">
            {board.title}
          </h3>
          <RoleBadge role={board.role} />
        </div>
        <p className="mt-1 text-xs text-slate-500">Updated {formatRelative(board.updatedAt)}</p>
      </div>
    </Link>
  );
}

export function NewBoardTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[7.5rem] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none"
    >
      + Create new board
    </button>
  );
}

export function BoardTileSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="h-16 bg-slate-200" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-2/3 rounded bg-slate-200" />
        <div className="h-3 w-1/3 rounded bg-slate-100" />
      </div>
    </div>
  );
}
