import mongoose, { Schema, Document } from 'mongoose';

export interface IPlan extends Document {
  planId: string;
  requestIds: string[];
  mode: 'baseline' | 'optimized';
  source: string;
  assignments: Record<string, unknown>[];
  metrics: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

const PlanSchema = new Schema<IPlan>(
  {
    planId: { type: String, required: true, unique: true, index: true },
    requestIds: [{ type: String, required: true }],
    mode: { type: String, enum: ['baseline', 'optimized'], required: true },
    source: { type: String, required: true },
    assignments: [Schema.Types.Mixed],
    metrics: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL Index to automatically prune stale calculated plans after expiration
PlanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Plan = mongoose.model<IPlan>('Plan', PlanSchema);
