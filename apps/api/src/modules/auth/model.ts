import { model, Schema, type Types } from 'mongoose';

export interface RefreshToken {
  userId: Types.ObjectId;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    // TTL index: MongoDB deletes the document once expiresAt has passed.
    expiresAt: { type: Date, required: true, expires: 0 },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const RefreshTokenModel = model<RefreshToken>('RefreshToken', refreshTokenSchema);
