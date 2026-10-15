import mongoose, { Schema, Document } from 'mongoose';

export type ReservationStatus = 'RESERVED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED' | 'EXPIRED';

export interface IReservation extends Document {
  id: string; // e.g. RSV-1001
  unitId: string;
  requestId: string;
  fromHospitalId: string;
  toHospitalId: string;
  dispatchAt: Date;
  eta: Date;
  transitMinutes: number;
  status: ReservationStatus;
  isActive: boolean;
  idempotencyKey?: string;
  createdAt: Date;
}

const ReservationSchema = new Schema<IReservation>(
  {
    id: { type: String, required: true, unique: true, index: true },
    unitId: { type: String, required: true },
    requestId: { type: String, required: true, index: true },
    fromHospitalId: { type: String, required: true },
    toHospitalId: { type: String, required: true },
    dispatchAt: { type: Date, required: true },
    eta: { type: Date, required: true },
    transitMinutes: { type: Number, required: true },
    status: {
      type: String,
      enum: ['RESERVED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'EXPIRED'],
      default: 'RESERVED',
      required: true,
    },
    isActive: { type: Boolean, required: true, default: true },
    idempotencyKey: { type: String, required: false },
  },
  { timestamps: true }
);

// Pre-save hook ensuring isActive is strictly synchronised with status
ReservationSchema.pre('validate', function (next) {
  this.isActive = this.status === 'RESERVED' || this.status === 'IN_TRANSIT';
  next();
});

// CRITICAL DEFENSE-IN-DEPTH INDEX:
// Guarantees no unit can ever be in more than one active reservation (RESERVED or IN_TRANSIT)
ReservationSchema.index(
  { unitId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

// Idempotency key uniqueness
ReservationSchema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true }
);

export const Reservation = mongoose.model<IReservation>('Reservation', ReservationSchema);
