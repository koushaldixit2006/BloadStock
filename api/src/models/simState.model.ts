import mongoose, { Schema, Document } from 'mongoose';

export interface ISimState extends Document {
  key: string; // 'current' singleton
  virtualNow: Date;
  isPaused: boolean;
  speedMultiplier: number;
  activeScenario?: string;
}

const SimStateSchema = new Schema<ISimState>(
  {
    key: { type: String, required: true, unique: true, default: 'current' },
    virtualNow: { type: Date, required: true },
    isPaused: { type: Boolean, default: false },
    speedMultiplier: { type: Number, default: 1 },
    activeScenario: { type: String, required: false },
  },
  { timestamps: true }
);

export const SimState = mongoose.model<ISimState>('SimState', SimStateSchema);
