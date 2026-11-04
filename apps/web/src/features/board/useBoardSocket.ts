import {
  BOARD_EVENTS,
  BOARD_JOIN,
  CARD_DRAG,
  CARD_DRAGGING,
  cardDraggingSchema,
  PRESENCE_UPDATE,
  presenceUpdateSchema,
  type BoardDetail,
  type BoardEventName,
  type BoardMemberDto,
} from '@taskboard/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { api } from '../../lib/api';
import { getRealtimeSocket } from '../../lib/socket';
import { showToast } from '../../lib/toast-store';
import { activityKeys } from '../activity/api';
import { useAuth } from '../auth/api';
import { boardKeys } from '../boards/api';
import { commentKeys, storeComment } from '../card/comments-api';
import { moveCardKey } from './api';
import {
  applyBoardEvent,
  applyMembers,
  cardIdOf,
  cardWithHistory,
  describeRemoteMove,
  parseBoardEvent,
  type BoardEvent,
} from './live-events';
import { applyDragging, applyPresence, resetLive, useLiveStore } from './live-store';

export const BOARD_DELETED_MESSAGE = 'This board was deleted.';
export const REMOVED_MESSAGE = 'You were removed from this board.';

const joinedAckSchema = z.object({ ok: z.literal(true) });
const connectErrorSchema = z.object({ data: z.object({ code: z.string() }) });

/** Tells the others on the board that this user started (`cardId`) or stopped dragging. */
export function sendCardDrag(boardId: string, cardId: string | null): void {
  const socket = getRealtimeSocket();
  if (socket.connected) socket.emit(CARD_DRAG, { boardId, cardId });
}

/**
 * Keeps the cached board in sync with other people's writes: joins the board's room, applies
 * each event to the TanStack Query cache, and refetches whenever events may have been missed.
 */
export function useBoardSocket(boardId: string): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const userId = useAuth().user?.id;
  // Read through refs, so a change of user (sign-out) or of the navigate function doesn't
  // reconnect the socket.
  const userIdRef = useRef(userId);
  const navigateRef = useRef(navigate);
  useEffect(() => {
    userIdRef.current = userId;
    navigateRef.current = navigate;
  }, [userId, navigate]);

  useEffect(() => {
    const socket = getRealtimeSocket();
    const queryKey = boardKeys.detail(boardId);
    const mutationCache = queryClient.getMutationCache();
    let stopWaiting: (() => void) | null = null;
    let sessionRetried = false;
    // Set by the cleanup. Work that finishes after it (a join ack, a session refresh) must
    // not touch the socket or the cache for a board the user has left.
    let disposed = false;

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
      if (disposed) return;
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
        if (disposed) return;
        // Not a member or no such board: the board query already shows that error.
        if (!joinedAckSchema.safeParse(ack).success) return;
        // Events sent before this join (while offline, or since a cached copy was loaded) are
        // lost, so take the server's copy. On first load the board fetch is still running.
        const hasData = queryClient.getQueryData(queryKey) !== undefined;
        if (hasData && queryClient.isFetching({ queryKey }) === 0) refetchWhenIdle();
        // Comments and card history missed the same events. Only an open card refetches now;
        // the rest are marked stale.
        void queryClient.invalidateQueries({ queryKey: commentKeys.all });
        void queryClient.invalidateQueries({ queryKey: activityKeys.cards() });
      } catch {
        // Ack timeout. The connection is probably dropping; the next connect joins again.
      }
    }

    /** The board is gone for this user (deleted, or they were removed): leave its page. */
    function leaveBoard(message: string) {
      showToast(message, 'info');
      void queryClient.invalidateQueries({ queryKey: boardKeys.list() });
      // Remove the board only after leaving its page, or the page would refetch it and 404.
      void Promise.resolve(navigateRef.current('/', { replace: true })).then(() =>
        queryClient.removeQueries({ queryKey }),
      );
    }

    function onMembersUpdated(members: BoardMemberDto[]) {
      const userId = userIdRef.current;
      const detail = queryClient.getQueryData<BoardDetail>(queryKey);
      if (!userId || !detail) return;
      const updated = applyMembers(detail, members, userId);
      if (!updated) return leaveBoard(REMOVED_MESSAGE);
      queryClient.setQueryData(queryKey, updated);
      // A removal also unassigns that person from cards; the refetch picks those cards up.
      refetchWhenIdle();
    }

    function onEvent(event: BoardEvent) {
      if (event.payload.boardId !== boardId) return;
      if (event.name === 'board:deleted') return leaveBoard(BOARD_DELETED_MESSAGE);
      if (event.name === 'members:updated') return onMembersUpdated(event.payload.members);

      // A card's history changed. Only an open History tab refetches; others go stale.
      const historyOf = cardWithHistory(event);
      if (historyOf) void queryClient.invalidateQueries({ queryKey: activityKeys.card(historyOf) });
      if (event.name === 'comment:created') return storeComment(queryClient, event.payload.comment);

      if (event.name === 'card:moved' && event.payload.actorId !== userIdRef.current) {
        const detail = queryClient.getQueryData<BoardDetail>(queryKey);
        const message = detail && describeRemoteMove(detail, event.payload);
        if (message) showToast(message, 'info');
      }

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
    // Presence and drag cues from before the drop are stale; the rejoin sends fresh ones.
    const onDisconnect = () => resetLive(boardId);

    const onPresence = (payload: unknown) => {
      const parsed = presenceUpdateSchema.safeParse(payload);
      if (parsed.success) useLiveStore.setState((state) => applyPresence(state, parsed.data));
    };
    const onDragging = (payload: unknown) => {
      const parsed = cardDraggingSchema.safeParse(payload);
      if (parsed.success) useLiveStore.setState((state) => applyDragging(state, parsed.data));
    };

    // The server refuses the handshake when the access token has expired. Refresh once, then
    // reconnect; if the refresh fails, recoverSession() signs the user out.
    const onConnectError = (error: unknown) => {
      const parsed = connectErrorSchema.safeParse(error);
      if (!parsed.success || parsed.data.data.code !== 'UNAUTHORIZED' || sessionRetried) return;
      sessionRetried = true;
      void api.recoverSession().then((ok) => {
        // Reconnecting after the user left would leave an open socket with no listeners.
        if (ok && !disposed) socket.connect();
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
    const signalListeners = [
      { name: 'connect', listener: onConnect },
      { name: 'connect_error', listener: onConnectError },
      { name: 'disconnect', listener: onDisconnect },
      { name: PRESENCE_UPDATE, listener: onPresence },
      { name: CARD_DRAGGING, listener: onDragging },
    ];
    signalListeners.forEach(({ name, listener }) => socket.on(name, listener));

    resetLive(boardId);
    if (socket.connected) void join();
    else socket.connect();

    return () => {
      disposed = true;
      [...eventListeners, ...signalListeners].forEach(({ name, listener }) =>
        socket.off(name, listener),
      );
      stopWaiting?.();
      resetLive(null);
      // Disconnecting leaves every room. The next board page connects again.
      socket.disconnect();
    };
  }, [boardId, queryClient]);
}
