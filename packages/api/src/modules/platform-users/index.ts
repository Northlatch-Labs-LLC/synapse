import type { FastifyInstance } from "fastify"
import { registerPlatformUserRoutes } from "./controller.js"

export default async function platformUsersModule(app: FastifyInstance) {
  registerPlatformUserRoutes(app)
}
