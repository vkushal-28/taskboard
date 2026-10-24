import type { CardDto } from '@taskboard/shared';
import { model, Schema, type Types } from 'mongoose';

export interface CardLabel {
  name: string;
  color: string;
}

export interface ChecklistItem {
  _id: Types.ObjectId;
  text: string;
  done: boolean;
}

export interface Card {
  boardId: Types.ObjectId;
  listId: Types.ObjectId;
  title: string;
  description: string;
  /** Fractional index within the list: a move rewrites only this card. */
  position: string;
  labels: CardLabel[];
  assignees: Types.ObjectId[];
  dueDate: Date | null;
  checklist: ChecklistItem[];
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const cardLabelSchema = new Schema<CardLabel>(
  {
    name: { type: String, required: true, trim: true },
    color: { type: String, required: true },
  },
  { _id: false },
);

// Checklist items keep their _id so a single item can be toggled or removed.
const checklistItemSchema = new Schema<ChecklistItem>({
  text: { type: String, required: true, trim: true },
  done: { type: Boolean, default: false },
});

const cardSchema = new Schema<Card>(
  {
    boardId: { type: Schema.Types.ObjectId, ref: 'Board', required: true },
    listId: { type: Schema.Types.ObjectId, ref: 'List', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    position: { type: String, required: true },
    labels: { type: [cardLabelSchema], default: [] },
    assignees: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    dueDate: { type: Date, default: null },
    checklist: { type: [checklistItemSchema], default: [] },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

cardSchema.index({ boardId: 1, listId: 1, position: 1 });

export const CardModel = model<Card>('Card', cardSchema);

export function toCardDto(
  card: Omit<Card, 'createdAt' | 'updatedAt'> & { _id: Types.ObjectId },
): CardDto {
  return {
    id: card._id.toString(),
    boardId: card.boardId.toString(),
    listId: card.listId.toString(),
    title: card.title,
    description: card.description,
    position: card.position,
    labels: card.labels.map(({ name, color }) => ({ name, color })),
    assignees: card.assignees.map((userId) => userId.toString()),
    dueDate: card.dueDate ? card.dueDate.toISOString() : null,
    checklist: card.checklist.map((item) => ({
      id: item._id.toString(),
      text: item.text,
      done: item.done,
    })),
    archived: card.archived,
  };
}
