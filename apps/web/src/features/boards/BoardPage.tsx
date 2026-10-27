import { Link, useParams } from 'react-router';
import { AppHeader } from '../../components/AppHeader';
import { RoleBadge } from '../../components/RoleBadge';
import { isApiError } from '../../lib/api-error';
import { useBoard } from './api';

// Placeholder until Slice 3.3 builds the board view with lists, cards and drag and drop.
export function BoardPage() {
  const { boardId = '' } = useParams();
  const board = useBoard(boardId);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {board.isPending && <p className="text-sm text-slate-500">Loading board…</p>}
        {board.isError && (
          <p className="text-sm text-red-600">
            {isApiError(board.error, 404)
              ? 'This board does not exist or is not shared with you.'
              : 'Could not load this board.'}{' '}
            <Link to="/" className="font-medium underline">
              Back to your boards
            </Link>
          </p>
        )}
        {board.isSuccess && (
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{board.data.board.title}</h1>
            <RoleBadge role={board.data.board.myRole} />
          </div>
        )}
      </main>
    </div>
  );
}
