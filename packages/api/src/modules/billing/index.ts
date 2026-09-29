import type { FastifyInstance } from "fastify"
import { registerBillingRoutes } from "./controller.js"

export default async function billingModule(fastify: FastifyInstance) {
  await registerBillingRoutes(fastify)
}
