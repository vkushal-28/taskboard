import { Link } from 'react-router';
import { Avatar } from '../../components/Avatar';
import { formatRelative, useNow } from '../../lib/time';
import { useRecentActivity } from './api';
import { describeActivity } from './describe';

export function RecentActivity() {
  const activity = useRecentActivity();
  const now = useNow();

  return (
    <section
      aria-labelledby="recent-activity"
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <h2 id="recent-activity" className="text-sm font-semibold text-slate-900">
        Recent activity
      </h2>

      {activity.isPending && <p className="mt-4 text-sm text-slate-500">Loading activity…</p>}
      {activity.isError && <p className="mt-4 text-sm text-red-600">Could not load activity.</p>}
      {activity.isSuccess && activity.data.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          Nothing yet. Changes on your boards will show up here.
        </p>
      )}

      {activity.isSuccess && activity.data.length > 0 && (
        <ol className="mt-4 space-y-4">
          {activity.data.map((item) => (
            <li key={item.id} className="flex gap-3">
              {item.actor ? (
                <Avatar id={item.actor.id} name={item.actor.name} size="sm" />
              ) : (
                <span className="h-6 w-6 shrink-0 rounded-full bg-slate-200" />
              )}
              <div className="min-w-0 text-sm">
                <p className="text-slate-700">
                  <span className="font-medium text-slate-900">
                    {item.actor?.name ?? 'Someone'}
                  </span>{' '}
                  {describeActivity(item)}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.board.color }}
                  />
                  <Link to={`/b/${item.board.id}`} className="truncate hover:underline">
                    {item.board.title}
                  </Link>
                  <span aria-hidden="true">·</span>
                  <time dateTime={item.createdAt}>{formatRelative(item.createdAt, now)}</time>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
