import type { BoardMemberDto, CardDto } from '@taskboard/shared';
import { Avatar } from '../../components/Avatar';
import { DUE_BADGE_CLASSES, DUE_STATUS_TEXT, dueStatus } from '../../lib/due-date';
import { useNow } from '../../lib/time';
import { CardActivity } from './CardActivity';
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

/**
 * The card modal's content: title, list, members, labels, due date, description, checklist,
 * activity, and the sidebar for members. Viewers see it read-only.
 */
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
  const due = card.dueDate === null ? null : dueStatus(card.dueDate, now);

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
                      className={`inline-block rounded px-1.5 py-0.5 font-medium ring-1 ring-inset ${DUE_BADGE_CLASSES[due ?? 'later']}`}
                    >
                      {dueFormatter.format(Date.parse(card.dueDate))}
                      {due && DUE_STATUS_TEXT[due] && ` · ${DUE_STATUS_TEXT[due]}`}
                    </time>
                  </dd>
                </div>
              )}
            </dl>
          )}

          <CardDescriptionField card={card} canEdit={canEdit} />
          <CardChecklist card={card} canEdit={canEdit} />

          <CardActivity card={card} canEdit={canEdit} />
        </div>

        {canEdit && (
          <CardSidebar card={card} members={members} onClose={onClose} setLeaving={setLeaving} />
        )}
      </div>
    </div>
  );
}
