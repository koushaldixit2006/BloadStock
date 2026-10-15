import mongoose, { Schema, Document } from 'mongoose';
import { BloodGroup, Component } from '../services/rules.service';

export type UrgencyLevel = 'ROUTINE' | 'URGENT' | 'CRITICAL';
export type RequestStatus = 'OPEN' | 'PLANNED' | 'PARTIAL' | 'UNFULFILLED' | 'CANCELLED';

export interface IBloodRequest extends Document {
  id: string; // e.g. R-101
  hospitalId: string;
  component: Component;
  group: BloodGroup;
  unitsNeeded: number;
  neededBy: Date;
  urgency: UrgencyLevel;
  status: RequestStatus;
  createdAt: Date;
  clinicalContext?: string;
}

const RequestSchema = new Schema<IBloodRequest>(
  {
    id: { type: String, required: true, unique: true, index: true },
    hospitalId: { type: String, required: true, index: true },
    component: {
      type: String,
      enum: ['RED_CELLS', 'PLATELETS', 'PLASMA'],
      required: true,
    },
    group: {
      type: String,
      enum: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
      required: true,
    },
    unitsNeeded: { type: Number, required: true, min: 1 },
    neededBy: { type: Date, required: true, index: true },
    urgency: {
      type: String,
      enum: ['ROUTINE', 'URGENT', 'CRITICAL'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['OPEN', 'PLANNED', 'PARTIAL', 'UNFULFILLED', 'CANCELLED'],
      default: 'OPEN',
      required: true,
      index: true,
    },
    clinicalContext: { type: String, required: false },
  },
  { timestamps: true }
);

export const BloodRequest = mongoose.model<IBloodRequest>('BloodRequest', RequestSchema);
