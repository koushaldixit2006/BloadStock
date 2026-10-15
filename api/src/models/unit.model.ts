import mongoose, { Schema, Document } from 'mongoose';

export type BloodGroup = 'O-' | 'O+' | 'A-' | 'A+' | 'B-' | 'B+' | 'AB-' | 'AB+';
export type Component = 'RED_CELLS' | 'PLATELETS' | 'PLASMA';
export type UnitStatus = 'AVAILABLE' | 'RESERVED' | 'IN_TRANSIT' | 'EXPIRED' | 'USED';

export interface IUnit extends Document {
  id: string; // e.g. U-10001
  component: Component;
  group: BloodGroup;
  hospitalId: string;
  collectedAt: Date;
  expiresAt: Date;
  status: UnitStatus;
  version: number;
  reservedForRequestId?: string;
}

const UnitSchema = new Schema<IUnit>(
  {
    id: { type: String, required: true, unique: true, index: true },
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
    hospitalId: { type: String, required: true, index: true },
    collectedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['AVAILABLE', 'RESERVED', 'IN_TRANSIT', 'EXPIRED', 'USED'],
      default: 'AVAILABLE',
      required: true,
      index: true,
    },
    version: { type: Number, default: 0, required: true },
    reservedForRequestId: { type: String, required: false },
  },
  { timestamps: true }
);

UnitSchema.index({ status: 1, component: 1, group: 1 });
UnitSchema.index({ hospitalId: 1, status: 1 });

export const Unit = mongoose.model<IUnit>('Unit', UnitSchema);
