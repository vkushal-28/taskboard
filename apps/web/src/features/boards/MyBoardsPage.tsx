import type { BoardSummary } from '@taskboard/shared';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { AppHeader } from '../../components/AppHeader';
import { greetingFor, useNow } from '../../lib/time';
import { RecentActivity } from '../activity/RecentActivity';
import { useAuth } from '../auth/api';
import { useBoards } from './api';
import { BoardTile, BoardTileSkeleton, NewBoardTile } from './BoardTile';
import { CreateBoardDialog } from './CreateBoardDialog';

export function MyBoardsPage() {
  const { user } = useAuth();
  const boards = useBoards();
  const now = useNow();
  const [creating, setCreating] = useState(false);
  // The search lives in the URL, so it survives a reload and the back button.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';

  function setSearch(value: string) {
    setSearchParams(value ? { q: value } : {}, { replace: true });
  }

  const matching = filterBoards(boards.data ?? [], search);
  const owned = matching.filter((board) => board.role === 'owner');
  const shared = matching.filter((board) => board.role !== 'owner');
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader search={<BoardSearch value={search} onChange={setSearch} />} />

      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {greetingFor(new Date(now))}, {firstName}
              </h1>
              <p className="mt-1 text-sm text-slate-600">Here is what your teams are working on.</p>
            </div>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none"
            >
              New board
            </button>
          </div>

          {boards.isError ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm">
              <p className="text-red-700">We could not load your boards.</p>
              <button
                type="button"
                onClick={() => void boards.refetch()}
                className="mt-2 font-medium text-red-700 underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <BoardSection
                title="Your boards"
                loading={boards.isPending}
                boards={owned}
                leading={search ? undefined : <NewBoardTile onClick={() => setCreating(true)} />}
                empty={search ? `No boards of yours match "${search}".` : null}
              />
              <BoardSection
                title="Shared with you"
                loading={boards.isPending}
                boards={shared}
                empty={
                  search
                    ? `No shared boards match "${search}".`
                    : 'Boards that others share with you will appear here.'
                }
              />
            </>
          )}
        </div>

        <aside>
          <RecentActivity />
        </aside>
      </main>

      <CreateBoardDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function filterBoards(boards: BoardSummary[], search: string): BoardSummary[] {
  const needle = search.trim().toLowerCase();
  return needle ? boards.filter((board) => board.title.toLowerCase().includes(needle)) : boards;
}

interface BoardSectionProps {
  title: string;
  loading: boolean;
  boards: BoardSummary[];
  /** Rendered before the tiles, e.g. the "Create new board" tile. */
  leading?: ReactNode;
  /** Shown when there are no tiles and nothing leading; null shows nothing. */
  empty: string | null;
}

function BoardSection({ title, loading, boards, leading, empty }: BoardSectionProps) {
  const headingId = `section-${title.toLowerCase().replace(/\s+/g, '-')}`;
  const showEmpty = !loading && boards.length === 0 && !leading && empty;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </h2>
      {showEmpty ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            [0, 1, 2].map((key) => <BoardTileSkeleton key={key} />)
          ) : (
            <>
              {leading}
              {boards.map((board) => (
                <BoardTile key={board.id} board={board} />
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function BoardSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="search"
      aria-label="Search boards"
      placeholder="Search boards"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="hidden w-56 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 focus:outline-none sm:block"
    />
  );
}
