import type { FastifyInstance } from "fastify"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { workspaceMiddleware } from "../../infrastructure/middleware/workspace.js"
import { appRoute } from "../../infrastructure/http/route.js"
import { getRequestUserId } from "../access/service.js"
import {
  BillingCheckoutInputSchema,
  BillingCheckoutResultSchema,
  BillingPlansViewSchema,
  BillingPortalResultSchema,
  BillingSubscriptionViewSchema,
  BillingWebhookResultSchema,
} from "@synapse/shared/schemas"
import {
  BillingNotConfiguredError,
  NotWorkspaceOwnerError,
  createCheckoutUrl,
  createPortalUrl,
  getPlans,
  getSubscription,
  handleWebhook,
  type StripeWebhookEvent,
} from "./service.js"
import { StripeClientError } from "./stripe-client.js"
import type { RawBodyRequest } from "../../infrastructure/http/json-body-parser.js"

/**
 * Billing routes. The webhook mounts WITHOUT session auth — the Stripe
 * signature IS the credential (the pairing-redeem lesson: never put a
 * credential-carrying callback behind the session gate).
 */

function readStripeSignatureHeader(
  headers: Record<string, unknown>
): string | undefined {
  const value = headers["stripe-signature"]
  return typeof value === "string" ? value : undefined
}

export async function registerBillingRoutes(fastify: FastifyInstance) {
  const authHook = { preHandler: [authMiddleware] }
  const workspaceAuthHook = {
    preHandler: [authMiddleware, workspaceMiddleware],
  }

  appRoute(
    fastify,
    "GET",
    "/api/v1/workspaces/:workspaceId/billing/plans",
    { schema: BillingPlansViewSchema, options: workspaceAuthHook },
    async (request) => {
      const workspaceId = (request.params as { workspaceId: string })
        .workspaceId
      return getPlans(workspaceId)
    }
  )

  appRoute(
    fastify,
    "GET",
    "/api/v1/workspaces/:workspaceId/billing/subscription",
    { schema: BillingSubscriptionViewSchema, options: workspaceAuthHook },
    async (request) => {
      const workspaceId = (request.params as { workspaceId: string })
        .workspaceId
      return getSubscription(workspaceId)
    }
  )

  appRoute(
    fastify,
    "POST",
    "/api/v1/workspaces/:workspaceId/billing/checkout",
    { schema: BillingCheckoutResultSchema, options: workspaceAuthHook },
    async (request, reply) => {
      const workspaceId = (request.params as { workspaceId: string })
        .workspaceId
      const body = BillingCheckoutInputSchema.parse(request.body ?? {})
      try {
        const url = await createCheckoutUrl({
          workspaceId,
          userId: getRequestUserId(request),
          plan: body.plan,
          seats: body.seats,
        })
        return { url }
      } catch (error) {
        return billingErrorReply(reply, error)
      }
    }
  )

  appRoute(
    fastify,
    "POST",
    "/api/v1/workspaces/:workspaceId/billing/portal",
    { schema: BillingPortalResultSchema, options: workspaceAuthHook },
    async (request, reply) => {
      const workspaceId = (request.params as { workspaceId: string })
        .workspaceId
      try {
        const url = await createPortalUrl({
          workspaceId,
          userId: getRequestUserId(request),
        })
        return { url }
      } catch (error) {
        return billingErrorReply(reply, error)
      }
    }
  )

  // No authMiddleware: Stripe-signed payloads only.
  fastify.post("/api/v1/billing/webhook", async (request, reply) => {
    const rawBody = (request as RawBodyRequest).rawBody
    if (typeof rawBody !== "string") {
      reply.status(400).send({ error: "Raw body missing" })
      return
    }
    try {
      const result = await handleWebhook({
        rawBody,
        signatureHeader: readStripeSignatureHeader(request.headers),
        event: request.body as StripeWebhookEvent,
      })
      reply.status(200).send(result)
    } catch {
      reply.status(400).send({ error: "Invalid webhook" })
    }
  })
}

function billingErrorReply(
  reply: import("fastify").FastifyReply,
  error: unknown
) {
  if (error instanceof NotWorkspaceOwnerError) {
    reply
      .status(403)
      .send({ error: error.message, code: "not_workspace_owner" })
  } else if (error instanceof BillingNotConfiguredError) {
    reply
      .status(400)
      .send({ error: error.message, code: "billing_not_configured" })
  } else if (error instanceof StripeClientError) {
    reply.status(502).send({ error: error.message, code: "stripe_error" })
  } else {
    throw error
  }
  return undefined
}
