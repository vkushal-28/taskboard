import type { PublicUser } from '@taskboard/shared';
import { model, Schema, type HydratedDocument } from 'mongoose';

export interface User {
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<User>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

export const UserModel = model<User>('User', userSchema);

export function toPublicUser(user: HydratedDocument<User>): PublicUser {
  return { id: user.id, name: user.name, email: user.email };
}
