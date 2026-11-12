import type { BoardDetail } from '@taskboard/shared';
import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { InviteForm, IssuedLinkBox } from './InviteForm';
import type { IssuedLink } from './issued-link';
import { MemberList } from './MemberList';
import { PendingInvites } from './PendingInvites';

/** The Share button and its dialog. Owners only: BoardHeader doesn't render it for others. */
export function ShareButton({ board }: { board: BoardDetail['board'] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Share
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Share "${board.title}"`}>
        <ShareContent board={board} />
      </Dialog>
    </>
  );
}

function ShareContent({ board }: { board: BoardDetail['board'] }) {
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  // A revoked invite's link is dead, so stop offering it.
  const forgetIfShown = (inviteId: string) =>
    setIssued((current) => (current?.inviteId === inviteId ? null : current));
  return (
    <div className="space-y-6" data-testid="share-dialog">
      <InviteForm boardId={board.id} onIssued={setIssued} />
      {issued && <IssuedLinkBox issued={issued} />}
      <MemberList board={board} />
      <PendingInvites boardId={board.id} onIssued={setIssued} onRevoked={forgetIfShown} />
    </div>
  );
}
