import type { ListDto } from '@taskboard/shared';
import { model, Schema, type Types } from 'mongoose';

export interface List {
  boardId: Types.ObjectId;
  title: string;
  /** Fractional index: lists sort by comparing these strings. */
  position: string;
  createdAt: Date;
  updatedAt: Date;
}

const listSchema = new Schema<List>(
  {
    boardId: { type: Schema.Types.ObjectId, ref: 'Board', required: true },
    title: { type: String, required: true, trim: true },
    position: { type: String, required: true },
  },
  { timestamps: true },
);

listSchema.index({ boardId: 1, position: 1 });

export const ListModel = model<List>('List', listSchema);

export function toListDto(
  list: Pick<List, 'boardId' | 'title' | 'position'> & { _id: Types.ObjectId },
): ListDto {
  return {
    id: list._id.toString(),
    boardId: list.boardId.toString(),
    title: list.title,
    position: list.position,
  };
}
