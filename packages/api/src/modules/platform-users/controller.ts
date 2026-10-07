import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"
import { formatValidationDetails } from "../../infrastructure/validation-error.js"
import {
  PlatformNoContentSchema,
  PlatformUserListQuerySchema,
  PlatformUserListViewSchema,
} from "@synapse/shared/schemas"
import { appRoute } from "../../infrastructure/http/route.js"
import { authMiddleware } from "../../infrastructure/middleware/auth.js"
import { PLATFORM_RESOURCE_ID } from "../access/evaluator.js"
import { requireRequestAction } from "../access/guards.js"
import {
  listPlatformUsersPage,
  signOutPlatformUserEverywhere,
  suspendPlatformUser,
  unsuspendPlatformUser,
} from "./repo-orchestration.js"
import { PlatformUserNotFoundError } from "./service.js"
import { presentPlatformUser } from "./presenter.js"

const userIdParamsSchema = z.object({
  userId: z.uuid(),
})

// Same guard as every other platform-admin route (modules/platform): the
// platform.manage action on the PLATFORM_RESOURCE_ID resource.
async function requirePlatformManagePermission(
  request: FastifyRequest,
  reply: FastifyReply,
  errorMessage: string
) {
  return requireRequestAction(
    request,
    reply,
    "platform.manage",
    PLATFORM_RESOURCE_ID,
    errorMessage
  )
}

export function registerPlatformUserRoutes(app: FastifyInstance) {
  const authHook = { preHandler: [authMiddleware] }

  appRoute(
    app,
    "GET",
    "/api/v1/platform/users",
    {
      schema: PlatformUserListViewSchema,
      options: authHook,
    },
    async (request, reply) => {
      const allowed = await requirePlatformManagePermission(
        request,
        reply,
        "Not allowed to manage platform users"
      )
      if (!allowed) return

      const parsed = PlatformUserListQuerySchema.safeParse(request.query ?? {})
      if (!parsed.success) {
        reply.status(400).send({
          error: "Validation failed",
          details: formatValidationDetails(parsed.error),
        })
        return
      }

      const page = await listPlatformUsersPage(parsed.data)
      return {
        users: page.users.map(presentPlatformUser),
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
      }
    }
  )

  appRoute(
    app,
    "POST",
    "/api/v1/platform/users/:userId/suspend",
    {
      schema: PlatformNoContentSchema,
      options: authHook,
    },
    async (request, reply) => {
      const allowed = await requirePlatformManagePermission(
        request,
        reply,
        "Not allowed to manage platform users"
      )
      if (!allowed) return

      const params = userIdParamsSchema.parse(request.params)
      try {
        await suspendPlatformUser(params.userId)
      } catch (err) {
        return platformUserErrorReply(reply, err)
      }
      return reply.status(204).send()
    }
  )

  appRoute(
    app,
    "POST",
    "/api/v1/platform/users/:userId/unsuspend",
    {
      schema: PlatformNoContentSchema,
      options: authHook,
    },
    async (request, reply) => {
      const allowed = await requirePlatformManagePermission(
        request,
        reply,
        "Not allowed to manage platform users"
      )
      if (!allowed) return

      const params = userIdParamsSchema.parse(request.params)
      try {
        await unsuspendPlatformUser(params.userId)
      } catch (err) {
        return platformUserErrorReply(reply, err)
      }
      return reply.status(204).send()
    }
  )

  appRoute(
    app,
    "POST",
    "/api/v1/platform/users/:userId/sign-out-everywhere",
    {
      schema: PlatformNoContentSchema,
      options: authHook,
    },
    async (request, reply) => {
      const allowed = await requirePlatformManagePermission(
        request,
        reply,
        "Not allowed to manage platform users"
      )
      if (!allowed) return

      const params = userIdParamsSchema.parse(request.params)
      try {
        await signOutPlatformUserEverywhere(params.userId)
      } catch (err) {
        return platformUserErrorReply(reply, err)
      }
      return reply.status(204).send()
    }
  )
}

function platformUserErrorReply(
  reply: FastifyReply,
  error: unknown
): FastifyReply {
  if (error instanceof PlatformUserNotFoundError) {
    return reply.status(404).send({ error: error.message })
  }
  throw error
}
