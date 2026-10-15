import mongoose, { Schema, Document } from 'mongoose';
import { computeAuditHash } from '../utils/hash';

export interface IActor {
  id: string;
  role: 'ADMIN' | 'COORDINATOR' | 'VIEWER' | 'SYSTEM';
  hospitalId?: string | undefined;
}

export interface IAuditLog extends Document {
  seq: number;
  timestamp: Date;
  actor: IActor;
  action: string;
  entity: string;
  entityId: string;
  diff: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    seq: { type: Number, required: true, unique: true, index: true },
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    actor: {
      id: { type: String, required: true },
      role: { type: String, enum: ['ADMIN', 'COORDINATOR', 'VIEWER', 'SYSTEM'], required: true },
      hospitalId: { type: String, required: false },
    },
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    diff: { type: Schema.Types.Mixed, default: {} },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
  },
  { timestamps: false }
);

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

/**
 * Verifies the integrity of the cryptographic audit log chain.
 */
export async function verifyAuditLogChain(): Promise<{
  valid: boolean;
  totalVerified: number;
  tamperedSeq?: number;
  reason?: string;
}> {
  const logs = await AuditLog.find().sort({ seq: 1 }).lean();
  let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';

  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i];
    if (!entry) continue;

    // Check sequence continuity
    if (entry.seq !== i + 1) {
      return {
        valid: false,
        totalVerified: i,
        tamperedSeq: entry.seq,
        reason: `Sequence break detected at index ${i}: expected seq ${i + 1}, found ${entry.seq}`,
      };
    }

    // Check prevHash chain linkage
    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        totalVerified: i,
        tamperedSeq: entry.seq,
        reason: `PrevHash mismatch at seq ${entry.seq}: expected ${expectedPrevHash}, found ${entry.prevHash}`,
      };
    }

    // Check hash integrity
    const payloadForHashing = {
      seq: entry.seq,
      timestamp: new Date(entry.timestamp).toISOString(),
      actor: entry.actor,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      diff: entry.diff,
    };

    const recalculatedHash = computeAuditHash(entry.prevHash, payloadForHashing);
    if (recalculatedHash !== entry.hash) {
      return {
        valid: false,
        totalVerified: i,
        tamperedSeq: entry.seq,
        reason: `Hash mismatch at seq ${entry.seq}: recalculated ${recalculatedHash}, recorded ${entry.hash}`,
      };
    }

    expectedPrevHash = entry.hash;
  }

  return {
    valid: true,
    totalVerified: logs.length,
  };
}
