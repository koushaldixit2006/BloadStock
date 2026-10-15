import mongoose, { Schema, Document } from 'mongoose';

export type RouteStatus = 'UP' | 'DOWN';

export interface IRoute extends Document {
  fromId: string;
  toId: string;
  baseMinutes: number;
  status: RouteStatus;
  delayMinutes: number;
}

const RouteSchema = new Schema<IRoute>(
  {
    fromId: { type: String, required: true },
    toId: { type: String, required: true },
    baseMinutes: { type: Number, required: true },
    status: { type: String, enum: ['UP', 'DOWN'], default: 'UP', required: true },
    delayMinutes: { type: Number, default: 0, required: true },
  },
  { timestamps: true }
);

RouteSchema.index({ fromId: 1, toId: 1 }, { unique: true });

export const Route = mongoose.model<IRoute>('Route', RouteSchema);
