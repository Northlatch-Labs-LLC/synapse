// Audit-export module wiring (G-S1): one authenticated, workspace-scoped,
// admin-gated GET that streams the signed export file.

import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { requireRequestAction } from "../access/guards.js"
import { appRoute } from "../../infrastructure/http/route.js"
import { config } from "../../config/index.js"
import { AuditExportKeyError, loadAuditSigningKey } from "./signing.js"
import { buildSignedBundle } from "./service.js"
import { findAuditExportEvents } from "./repo.js"

// Response contract: loose on event payloads (they are audit data, not API
// surface) but strict on the signed envelope.
const AuditExportBundleSchema = z.object({
  format: z.literal("synapse-audit-export/v1"),
  workspaceId: z.string(),
  generatedAt: z.string(),
  eventCount: z.number().int().nonnegative(),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  events: z.array(z.record(z.string(), z.unknown())),
  signature: z.object({
    alg: z.literal("ed25519"),
    keyId: z.string().regex(/^[0-9a-f]{64}$/),
    signedAt: z.string(),
    value: z.string(),
  }),
})

export default async function auditExportModule(app: FastifyInstance): Promise<void> {
  const workspaceHook = { preHandler: [authMiddleware, workspaceMiddleware] }

  appRoute(
    app,
    "GET",
    "/api/v1/workspaces/:workspaceId/audit-export",
    {
      schema: AuditExportBundleSchema,
      options: workspaceHook,
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string }

      // RBAC: admin-level on the workspace (permission "manage" rule —
      // workspace admins or holders of an explicit manage grant).
      if (!(await requireRequestAction(request, reply, "workspace.export_audit", workspaceId))) {
        return
      }

      let keys
      try {
        keys = loadAuditSigningKey(config.auditExport.signingKey)
      } catch (error) {
        if (error instanceof AuditExportKeyError) {
          return reply.status(503).send({
            code: "audit_export_unconfigured",
            message: `${error.message}. Generate a key with scripts/verify-audit-export.mjs --generate and set it before exporting.`,
          })
        }
        throw error
      }

      const query = request.query as Record<string, string | undefined>
      const from = query.from ? new Date(query.from) : undefined
      const to = query.to ? new Date(query.to) : undefined
      for (const [label, value] of [
        ["from", from],
        ["to", to],
      ] as const) {
        if (value && Number.isNaN(value.getTime())) {
          return reply.status(400).send({ code: "invalid_request", message: `query param "${label}" is not a valid ISO timestamp` })
        }
      }

      const events = await findAuditExportEvents(workspaceId, { from, to })
      const bundle = buildSignedBundle(keys, workspaceId, events)

      reply
        .header("content-type", "application/json; charset=utf-8")
        .header("content-disposition", `attachment; filename="audit-export-${workspaceId}-${bundle.generatedAt.replace(/[:.]/g, "-")}.json"`)
        .send(bundle)
    }
  )
}
