// platform-users/presenter.ts — domain records → app DTOs (camelCase wire
// shapes from @synapse/shared/schemas; Date → IsoInstantString here only).

import type { PlatformUserView } from "@synapse/shared/schemas"
import {
  serializeInstant,
  serializeOptionalInstant,
} from "../../infrastructure/datetime.js"
import type { PlatformUserRow } from "./repo.js"

export function presentPlatformUser(row: PlatformUserRow): PlatformUserView {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: row.emailVerified,
    createdAt: serializeInstant(row.createdAt),
    deletedAt: serializeOptionalInstant(row.deletedAt) ?? null,
    suspendedAt: serializeOptionalInstant(row.suspendedAt) ?? null,
    workspaceCount: row.workspaceCount,
    agentRuns7d: row.agentRuns7d,
    lastSuccessAt: serializeOptionalInstant(row.lastSuccessAt) ?? null,
  }
}
