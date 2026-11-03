import { BOARD_EVENTS, BOARD_JOIN, type BoardDetail, type BoardEventName } from '@taskboard/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { api } from '../../lib/api';
import { getRealtimeSocket } from '../../lib/socket';
import { showToast } from '../../lib/toast-store';
import { useAuth } from '../auth/api';
import { boardKeys } from '../boards/api';
import { moveCardKey } from './api';
import { applyBoardEvent, cardIdOf, parseBoardEvent, type BoardEvent } from './live-events';

export const BOARD_DELETED_MESSAGE = 'This board was deleted.';

const joinedAckSchema = z.object({ ok: z.literal(true) });
const connectErrorSchema = z.object({ data: z.object({ code: z.string() }) });

/**
 * Keeps the cached board in sync with other people's writes: joins the board's room, applies
 * each event to the TanStack Query cache, and refetches whenever events may have been missed.
 */
export function useBoardSocket(boardId: string): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const userId = useAuth().user?.id;
  // Read through a ref so a change of user (sign-out) doesn't reconnect the socket.
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    const socket = getRealtimeSocket();
    const queryKey = boardKeys.detail(boardId);
    const mutationCache = queryClient.getMutationCache();
    let stopWaiting: (() => void) | null = null;
    let sessionRetried = false;

    const movesInFlight = () =>
      mutationCache.findAll({ mutationKey: moveCardKey(boardId), status: 'pending' });

    const isMoving = (cardId: string) =>
      movesInFlight().some((move) => {
        const plan = move.state.variables;
        return (
          typeof plan === 'object' && plan !== null && 'cardId' in plan && plan.cardId === cardId
        );
      });

    // A refetch that lands during a move would show the card back in its old place, so wait
    // until every move on this board has settled.
    function refetchWhenIdle() {
      if (movesInFlight().length === 0) {
        void queryClient.invalidateQueries({ queryKey });
        return;
      }
      stopWaiting ??= mutationCache.subscribe(() => {
        if (movesInFlight().length > 0) return;
        stopWaiting?.();
        stopWaiting = null;
        void queryClient.invalidateQueries({ queryKey });
      });
    }

    async function join() {
      try {
        const ack = await socket.emitWithAck(BOARD_JOIN, { boardId });
        // Not a member or no such board: the board query already shows that error.
        if (!joinedAckSchema.safeParse(ack).success) return;
        // Events sent before this join (while offline, or since a cached copy was loaded) are
        // lost, so take the server's copy. On first load the board fetch is still running.
        const hasData = queryClient.getQueryData(queryKey) !== undefined;
        if (hasData && queryClient.isFetching({ queryKey }) === 0) refetchWhenIdle();
      } catch {
        // Ack timeout. The connection is probably dropping; the next connect joins again.
      }
    }

    function onBoardDeleted() {
      showToast(BOARD_DELETED_MESSAGE, 'info');
      void queryClient.invalidateQueries({ queryKey: boardKeys.list() });
      // Remove the board only after leaving its page, or the page would refetch it and 404.
      void Promise.resolve(navigate('/', { replace: true })).then(() =>
        queryClient.removeQueries({ queryKey }),
      );
    }

    function onEvent(event: BoardEvent) {
      if (event.payload.boardId !== boardId) return;
      if (event.name === 'board:deleted') return onBoardDeleted();

      const cardId = cardIdOf(event);
      if (cardId && isMoving(cardId)) {
        // Our own echo carries the same card the move's response will. Anyone else's change
        // would be overwritten by that response, so fetch the board once the move settles.
        if (event.payload.actorId !== userIdRef.current) refetchWhenIdle();
        return;
      }
      queryClient.setQueryData<BoardDetail>(queryKey, (detail) =>
        detail ? applyBoardEvent(detail, event) : detail,
      );
    }

    const onConnect = () => {
      sessionRetried = false;
      void join();
    };

    // The server refuses the handshake when the access token has expired. Refresh once, then
    // reconnect; if the refresh fails, recoverSession() signs the user out.
    const onConnectError = (error: unknown) => {
      const parsed = connectErrorSchema.safeParse(error);
      if (!parsed.success || parsed.data.data.code !== 'UNAUTHORIZED' || sessionRetried) return;
      sessionRetried = true;
      void api.recoverSession().then((ok) => {
        if (ok) socket.connect();
      });
    };

    const eventListeners = BOARD_EVENTS.map((name: BoardEventName) => {
      const listener = (payload: unknown) => {
        const event = parseBoardEvent(name, payload);
        if (event) onEvent(event);
      };
      socket.on(name, listener);
      return { name, listener };
    });
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);

    if (socket.connected) void join();
    else socket.connect();

    return () => {
      eventListeners.forEach(({ name, listener }) => socket.off(name, listener));
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      stopWaiting?.();
      // Disconnecting leaves every room. The next board page connects again.
      socket.disconnect();
    };
  }, [boardId, navigate, queryClient]);
}
