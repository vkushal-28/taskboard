import type { BoardDetail, CardDto, ListDto, Role } from '@taskboard/shared';

export const OWNER = { id: 'u1', name: 'Priya Sharma', role: 'owner' as const };
export const MEMBER = { id: 'u2', name: 'Alex Kim', role: 'member' as const };

export function list(id: string, title: string, position: string): ListDto {
  return { id, boardId: 'b1', title, position };
}

export function card(
  id: string,
  listId: string,
  position: string,
  overrides: Partial<CardDto> = {},
) {
  return {
    id,
    boardId: 'b1',
    listId,
    title: `Card ${id}`,
    description: '',
    position,
    labels: [],
    assignees: [],
    dueDate: null,
    checklist: [],
    archived: false,
    ...overrides,
  } satisfies CardDto;
}

/** To Do: c1, c2, c3 · In Progress: c4 · Done: empty. Cards are deliberately out of order. */
export function boardDetail(myRole: Role = 'owner'): BoardDetail {
  return {
    board: {
      id: 'b1',
      title: 'Website Redesign',
      color: '#2563eb',
      myRole,
      members: [OWNER, MEMBER],
    },
    lists: [list('l2', 'In Progress', 'a1'), list('l1', 'To Do', 'a0'), list('l3', 'Done', 'a2')],
    cards: [
      card('c3', 'l1', 'a2'),
      card('c1', 'l1', 'a0'),
      card('c4', 'l2', 'a0'),
      card('c2', 'l1', 'a1'),
    ],
  };
}
