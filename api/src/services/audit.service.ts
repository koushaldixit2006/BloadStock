import { ClientSession } from 'mongoose';
import { AuditLog, IAuditLog, IActor, verifyAuditLogChain } from '../models/auditLog.model';
import { computeAuditHash } from '../utils/hash';
import { logger } from '../utils/logger';

export interface AppendLogParams {
  actor: IActor;
  action: string;
  entity: string;
  entityId: string;
  diff?: Record<string, unknown>;
  description?: string;
  timestamp?: Date;
}

export class AuditService {
  /**
   * Appends an append-only, cryptographically chained audit log entry.
   * Runs atomically inside an optional mongoose ClientSession.
   */
  static async append(params: AppendLogParams, session?: ClientSession): Promise<IAuditLog> {
    const queryOpts: any = { sort: { seq: -1 } };
    if (session) queryOpts.session = session;
    const lastLog = await AuditLog.findOne({}, {}, queryOpts).lean();

    const nextSeq = lastLog ? lastLog.seq + 1 : 1;
    const prevHash = lastLog
      ? lastLog.hash
      : '0000000000000000000000000000000000000000000000000000000000000000';

    const timestamp = params.timestamp || new Date();

    const payloadForHashing = {
      seq: nextSeq,
      timestamp: timestamp.toISOString(),
      actor: params.actor,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      diff: params.diff || {},
    };

    const hash = computeAuditHash(prevHash, payloadForHashing);

    const doc = new AuditLog({
      seq: nextSeq,
      timestamp,
      actor: params.actor,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      diff: params.diff || {},
      prevHash,
      hash,
    });

    if (session) {
      await doc.save({ session });
    } else {
      await doc.save();
    }

    logger.info(
      { seq: nextSeq, action: params.action, entity: params.entity, entityId: params.entityId },
      'Audit log entry recorded'
    );

    return doc;
  }

  /**
   * Recomputes and verifies the complete cryptographic hash chain.
   */
  static async verify(): Promise<{
    valid: boolean;
    totalVerified: number;
    tamperedSeq?: number;
    reason?: string;
  }> {
    return verifyAuditLogChain();
  }

  /**
   * Returns paginated audit logs with optional filtering.
   */
  static async list(query: {
    page?: number;
    limit?: number;
    entity?: string;
    entityId?: string;
    action?: string;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.entity) filter.entity = query.entity;
    if (query.entityId) filter.entityId = query.entityId;
    if (query.action) filter.action = query.action;

    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ seq: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
