import type { BoardMemberDto, CardDto } from '@taskboard/shared';
import { Avatar } from '../../components/Avatar';
import { useNow } from '../../lib/time';
import { CardChecklist } from './CardChecklist';
import { CardSidebar } from './CardSidebar';
import { CardDescriptionField, CardTitleField } from './CardTextFields';

const dueFormatter = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

interface CardDetailProps {
  card: CardDto;
  listTitle: string;
  members: BoardMemberDto[];
  /** Members and owners. Viewers get the same content with no controls (the api refuses them anyway). */
  canEdit: boolean;
  onClose: () => void;
  setLeaving: (leaving: boolean) => void;
}

export function CardDetail({
  card,
  listTitle,
  members,
  canEdit,
  onClose,
  setLeaving,
}: CardDetailProps) {
  const now = useNow();
  const assignees = members.filter((member) => card.assignees.includes(member.id));
  const overdue = card.dueDate !== null && Date.parse(card.dueDate) < now;

  return (
    <div data-testid="card-detail">
      <header className="flex items-start gap-3 border-b border-slate-200 px-6 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <CardTitleField card={card} canEdit={canEdit} />
          <p className="mt-1 text-sm text-slate-500">
            in list <span className="font-medium text-slate-700">{listTitle}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close card"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          ✕
        </button>
      </header>

      <div className="grid gap-6 px-6 py-5 sm:grid-cols-[1fr_12rem]">
        <div className="min-w-0 space-y-6">
          {(assignees.length > 0 || card.labels.length > 0 || card.dueDate) && (
            <dl className="flex flex-wrap gap-6">
              {assignees.length > 0 && (
                <div>
                  <dt className="text-xs font-semibold text-slate-500">Members</dt>
                  <dd className="mt-1 flex gap-1">
                    {assignees.map((member) => (
                      <span key={member.id} title={member.name}>
                        <Avatar id={member.id} name={member.name} />
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {card.labels.length > 0 && (
                <div>
                  <dt className="text-xs font-semibold text-slate-500">Labels</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {card.labels.map((label) => (
                      <span
                        key={label.name}
                        className="rounded px-2 py-1 text-xs font-medium text-white"
                        style={{ backgroundColor: label.color }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {card.dueDate && (
                <div>
                  <dt className="text-xs font-semibold text-slate-500">Due date</dt>
                  <dd className="mt-1 text-sm">
                    <time
                      dateTime={card.dueDate}
                      className={
                        overdue
                          ? 'rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700'
                          : 'text-slate-800'
                      }
                    >
                      {dueFormatter.format(Date.parse(card.dueDate))}
                      {overdue && ' · Overdue'}
                    </time>
                  </dd>
                </div>
              )}
            </dl>
          )}

          <CardDescriptionField card={card} canEdit={canEdit} />
          <CardChecklist card={card} canEdit={canEdit} />

          <section>
            <h3 className="text-sm font-semibold text-slate-700">Activity</h3>
            <p className="mt-2 text-sm text-slate-400">
              Comments and this card's history are coming soon.
            </p>
          </section>
        </div>

        {canEdit && (
          <CardSidebar card={card} members={members} onClose={onClose} setLeaving={setLeaving} />
        )}
      </div>
    </div>
  );
}
