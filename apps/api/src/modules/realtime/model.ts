import { model, Schema, type Types } from 'mongoose';

export interface SocketTicket {
  /** SHA-256 of the ticket. The ticket itself is never stored. */
  tokenHash: string;
  userId: Types.ObjectId;
  /** The session that asked for it, so a revoked session's sockets can be refused (ADR 016). */
  sessionId: string;
  expiresAt: Date;
}

const socketTicketSchema = new Schema<SocketTicket>({
  tokenHash: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

socketTicketSchema.index({ tokenHash: 1 }, { unique: true });
// MongoDB deletes tickets nobody used once they expire. The sweep runs about once a minute,
// so redeeming also checks expiresAt itself.
socketTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SocketTicketModel = model<SocketTicket>('SocketTicket', socketTicketSchema);
