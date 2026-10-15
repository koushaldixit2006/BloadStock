import mongoose, { Schema, Document } from 'mongoose';

export interface IHospital extends Document {
  id: string;
  name: string;
  shortName: string;
  coords: { x: number; y: number };
  tier: string;
}

const HospitalSchema = new Schema<IHospital>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    shortName: { type: String, required: true },
    coords: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    tier: { type: String, required: true },
  },
  { timestamps: true }
);

export const Hospital = mongoose.model<IHospital>('Hospital', HospitalSchema);
