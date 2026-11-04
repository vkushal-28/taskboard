import { hasRole } from '@taskboard/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Dialog } from '../../components/Dialog';
import { showToast } from '../../lib/toast-store';
import { useBoard } from '../boards/api';
import { CardDetail } from './CardDetail';

export const CARD_GONE_MESSAGE = 'This card is archived or was deleted.';

/**
 * `/b/:boardId/c/:cardId`, rendered over the board. The card comes from the cached board, so
 * opening it costs no request, and socket events keep it current while it's open.
 */
export function CardDetailRoute() {
  const { boardId = '', cardId = '' } = useParams();
  const navigate = useNavigate();
  const board = useBoard(boardId);
  const card = board.data?.cards.find((candidate) => candidate.id === cardId);
  // Set when this modal itself archives or deletes the card, so it doesn't also report
  // the card as gone.
  const leaving = useRef(false);

  const close = useCallback(() => {
    leaving.current = true;
    void Promise.resolve(navigate(`/b/${boardId}`)).then(() =>
      // The dialog unmounts with the route, so focus would fall back to the page. Give it to
      // the card that was open, like a native dialog returning focus to its opener.
      document.querySelector<HTMLElement>(`[data-testid="card-${cardId}"]`)?.focus(),
    );
  }, [boardId, cardId, navigate]);

  // Archived or deleted while open (by someone else), or a link to a card that's gone.
  useEffect(() => {
    if (!board.isSuccess || card || leaving.current) return;
    showToast(CARD_GONE_MESSAGE, 'info');
    close();
  }, [board.isSuccess, card, close]);

  if (!board.data || !card) return null;
  const list = board.data.lists.find((candidate) => candidate.id === card.listId);

  return (
    <Dialog open onClose={close} title={card.title} hideTitle size="xl">
      <CardDetail
        card={card}
        listTitle={list?.title ?? ''}
        members={board.data.board.members}
        canEdit={hasRole(board.data.board.myRole, 'member')}
        onClose={close}
        setLeaving={(value) => {
          leaving.current = value;
        }}
      />
    </Dialog>
  );
}
