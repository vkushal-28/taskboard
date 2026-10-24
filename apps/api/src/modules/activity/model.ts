import { ACTIVITY_TYPES, type ActivityType } from '@taskboard/shared';
import { model, Schema, type Types } from 'mongoose';

export interface Activity {
  boardId: Types.ObjectId;
  cardId: Types.ObjectId | null;
  actorId: Types.ObjectId;
  type: ActivityType;
  /** Type-specific details for rendering, e.g. `{ fromListId, toListId }` for a move. */
  meta: Record<string, unknown>;
  createdAt: Date;
}

const activitySchema = new Schema<Activity>(
  {
    boardId: { type: Schema.Types.ObjectId, ref: 'Board', required: true },
    cardId: { type: Schema.Types.ObjectId, ref: 'Card', default: null },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  // minimize: false keeps an empty `meta: {}`; by default Mongoose drops empty objects on save,
  // and readers would get undefined despite the type.
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

// The board and card feeds read newest first.
activitySchema.index({ boardId: 1, createdAt: -1 });
activitySchema.index({ cardId: 1, createdAt: -1 });

export const ActivityModel = model<Activity>('Activity', activitySchema);
