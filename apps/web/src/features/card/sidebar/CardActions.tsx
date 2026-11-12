import type { CardDto } from '@taskboard/shared';
import { useState } from 'react';
import { showToast } from '../../../lib/toast-store';
import { useDeleteCard, useUpdateCard } from '../api';
import { SidebarButton } from './SidebarButton';

interface CardActionsProps {
  card: CardDto;
  onClose: () => void;
  /** True while this modal archives or deletes the card, so it isn't reported as "gone". */
  setLeaving: (leaving: boolean) => void;
}

export function CardActions({ card, onClose, setLeaving }: CardActionsProps) {
  const archive = useUpdateCard(card.boardId, card.id);
  const remove = useDeleteCard(card.boardId, card.id);
  const [confirming, setConfirming] = useState(false);

  // mutateAsync, not mutate(…, { onSuccess }): the socket echo of this write often arrives
  // before the response and removes the card, which unmounts this modal, and TanStack Query
  // skips mutate's per-call callbacks after an unmount. The promise still settles.
  function leaveAfter(write: Promise<unknown>, message: string) {
    setLeaving(true);
    write.then(
      () => {
        showToast(message, 'info');
        onClose();
      },
      () => setLeaving(false),
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Actions</h3>
      <SidebarButton
        onClick={() => leaveAfter(archive.mutateAsync({ archived: true }), 'Card archived.')}
      >
        Archive
      </SidebarButton>
      {confirming ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">
            Delete this card for everyone? This can't be undone.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => leaveAfter(remove.mutateAsync(), 'Card deleted.')}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Delete card
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <SidebarButton onClick={() => setConfirming(true)}>Delete…</SidebarButton>
      )}
    </div>
  );
}
