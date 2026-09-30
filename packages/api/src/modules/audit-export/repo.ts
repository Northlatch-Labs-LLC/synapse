// Audit-export repository (layering rule r8/g2: SQL construction lives here,
// never in service files).

import { db } from "../../infrastructure/database/kysely.js"
import { serializeInstant } from "../../infrastructure/datetime.js"
import type { AuditExportEventRow, AuditExportRange } from "./service.js"

export async function findAuditExportEvents(
  workspaceId: string,
  range: AuditExportRange
): Promise<Array<Record<string, unknown>>> {
  let query = db
    .selectFrom("runtimeEvents")
    .select([
      "runtimeEvents.id",
      "runtimeEvents.conversationId",
      "runtimeEvents.sessionId",
      "runtimeEvents.turnId",
      "runtimeEvents.toolCallId",
      "runtimeEvents.actorId",
      "runtimeEvents.userId",
      "runtimeEvents.source",
      "runtimeEvents.level",
      "runtimeEvents.eventType",
      "runtimeEvents.payload",
      "runtimeEvents.createdAt",
    ])
    .where("runtimeEvents.workspaceId", "=", workspaceId)
    .orderBy("runtimeEvents.createdAt", "asc")
    .orderBy("runtimeEvents.id", "asc")
  if (range.from) query = query.where("runtimeEvents.createdAt", ">=", range.from)
  if (range.to) query = query.where("runtimeEvents.createdAt", "<=", range.to)
  const rows = await query.execute()
  return rows.map((row): AuditExportEventRow => ({
    id: row.id,
    conversationId: row.conversationId ?? null,
    sessionId: row.sessionId ?? null,
    turnId: row.turnId ?? null,
    toolCallId: row.toolCallId ?? null,
    actorId: row.actorId ?? null,
    userId: row.userId ?? null,
    source: row.source,
    level: row.level,
    eventType: row.eventType,
    payload: row.payload,
    createdAt: serializeInstant(row.createdAt),
  })).map(toExportEvent)
}

function toExportEvent(row: AuditExportEventRow): Record<string, unknown> {
  // Explicit allow-list projection: export shape is a contract for external
  // auditors, so new columns must be added deliberately, never leaked.
  return {
    id: row.id,
    conversationId: row.conversationId,
    sessionId: row.sessionId,
    turnId: row.turnId,
    toolCallId: row.toolCallId,
    actorId: row.actorId,
    userId: row.userId,
    source: row.source,
    level: row.level,
    eventType: row.eventType,
    payload: row.payload ?? {},
    createdAt: row.createdAt,
  }
}
