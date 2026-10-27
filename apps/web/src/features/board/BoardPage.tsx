import { Link, useParams } from 'react-router';
import { AppHeader } from '../../components/AppHeader';
import { isApiError } from '../../lib/api-error';
import { useBoard } from '../boards/api';
import { BoardCanvas } from './BoardCanvas';
import { BoardHeader } from './BoardHeader';

export function BoardPage() {
  const { boardId = '' } = useParams();
  const board = useBoard(boardId);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <AppHeader />
      {board.isPending && <BoardSkeleton />}
      {board.isError && (
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <p role="alert" className="text-sm text-red-600">
            {isApiError(board.error, 404)
              ? 'This board does not exist or is not shared with you.'
              : 'Could not load this board.'}{' '}
            <Link to="/" className="font-medium underline">
              Back to your boards
            </Link>
          </p>
        </main>
      )}
      {board.isSuccess && (
        <>
          <BoardHeader board={board.data.board} />
          <main className="min-h-0 flex-1 pt-4">
            <BoardCanvas detail={board.data} />
          </main>
        </>
      )}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div role="status" aria-label="Loading board" className="flex gap-4 px-4 pt-16 sm:px-6">
      {[0, 1, 2].map((key) => (
        <div key={key} className="h-64 w-72 shrink-0 animate-pulse rounded-xl bg-slate-200/70" />
      ))}
    </div>
  );
}
