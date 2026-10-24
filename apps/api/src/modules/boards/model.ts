import { ROLES, type Role } from '@taskboard/shared';
import { model, Schema, type Types } from 'mongoose';

export interface BoardMember {
  userId: Types.ObjectId;
  role: Role;
}

// Roles live only in `members` (owners included), so there is one place to look them up.
// Embedded rather than a separate collection: see ADR 005.
export interface Board {
  title: string;
  color: string;
  members: BoardMember[];
  createdAt: Date;
  updatedAt: Date;
}

const boardMemberSchema = new Schema<BoardMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { _id: false },
);

const boardSchema = new Schema<Board>(
  {
    title: { type: String, required: true, trim: true },
    color: { type: String, required: true },
    members: { type: [boardMemberSchema], required: true },
  },
  { timestamps: true },
);

// GET /boards and every role check query by member.
boardSchema.index({ 'members.userId': 1 });

export const BoardModel = model<Board>('Board', boardSchema);
