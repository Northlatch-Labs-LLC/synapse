import { sql } from "kysely"
import { db } from "../../infrastructure/database/kysely.js"
import type {
  BillingPlanId,
  BillingSubscriptionStatus,
} from "@synapse/shared/schemas"
import type { IsoInstantString } from "@synapse/shared/datetime"

/**
 * Billing persistence. House rule: SQL lives only in repo*.ts files.
 * The subscription row is created lazily — workspaces without one are "free".
 */

export interface WorkspaceSubscriptionRow {
  workspaceId: string
  plan: BillingPlanId
  status: BillingSubscriptionStatus
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stripePriceId: string | null
  seatQuantity: number
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

export async function selectSubscription(
  workspaceId: string
): Promise<WorkspaceSubscriptionRow | undefined> {
  const row = await db
    .selectFrom("workspaceSubscriptions")
    .selectAll()
    .where("workspaceId", "=", workspaceId)
    .executeTakeFirst()
  return (row as unknown as WorkspaceSubscriptionRow) || undefined
}

export async function upsertSubscription(
  input: Omit<
    WorkspaceSubscriptionRow,
    "currentPeriodStart" | "currentPeriodEnd"
  > & {
    currentPeriodStart: IsoInstantString | null
    currentPeriodEnd: IsoInstantString | null
  }
): Promise<void> {
  await db
    .insertInto("workspaceSubscriptions")
    .values({
      workspaceId: input.workspaceId,
      plan: input.plan,
      status: input.status,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripePriceId: input.stripePriceId,
      seatQuantity: input.seatQuantity,
      currentPeriodStart: input.currentPeriodStart
        ? new Date(input.currentPeriodStart)
        : null,
      currentPeriodEnd: input.currentPeriodEnd
        ? new Date(input.currentPeriodEnd)
        : null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    })
    .onConflict((oc) =>
      oc.column("workspaceId").doUpdateSet({
        plan: input.plan,
        status: input.status,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripePriceId: input.stripePriceId,
        seatQuantity: input.seatQuantity,
        currentPeriodStart: input.currentPeriodStart
          ? new Date(input.currentPeriodStart)
          : null,
        currentPeriodEnd: input.currentPeriodEnd
          ? new Date(input.currentPeriodEnd)
          : null,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      })
    )
    .execute()
}

export async function ensureFreeSubscriptionRow(
  workspaceId: string
): Promise<void> {
  await db
    .insertInto("workspaceSubscriptions")
    .values({ workspaceId, plan: "free", status: "active", seatQuantity: 1 })
    .onConflict((oc) => oc.column("workspaceId").doNothing())
    .execute()
}

export async function selectWorkspaceOwner(
  workspaceId: string
): Promise<
  { ownerId: string; name: string; ownerEmail: string | null } | undefined
> {
  const row = await db
    .selectFrom("workspaces as w")
    .innerJoin("users as owner", "owner.id", "w.ownerId")
    .select([
      "w.ownerId as ownerId",
      "w.name as name",
      "owner.email as ownerEmail",
    ])
    .where("w.id", "=", workspaceId)
    .where("w.deletedAt", "is", null)
    .executeTakeFirst()
  return row as
    | { ownerId: string; name: string; ownerEmail: string | null }
    | undefined
}

export interface WorkspaceUsageRow {
  members: number
  actors: number
}

export async function selectWorkspaceUsage(
  workspaceId: string
): Promise<WorkspaceUsageRow> {
  const result = await sql<{ members: string; actors: string }>`
    SELECT
      (SELECT COUNT(*) FROM workspace_members
        WHERE workspace_id = ${workspaceId}
          AND status = 'active'
          AND deleted_at IS NULL)::text AS members,
      (SELECT COUNT(*) FROM workspace_resources
        WHERE workspace_id = ${workspaceId}
          AND kind = 'actor'
          AND status = 'active'
          AND deleted_at IS NULL)::text AS actors
  `.execute(db)
  const row = result.rows[0]
  return {
    members: Number(row?.members ?? 0),
    actors: Number(row?.actors ?? 0),
  }
}

/**
 * Plan-limit gate used by enforcement points (invite / actor install).
 * Throws nothing; returns a violation descriptor the caller maps to 402.
 */
export async function checkPlanLimit(
  workspaceId: string,
  limit: "members" | "actors",
  limits: { maxActors: number; maxMembers: number; plan: BillingPlanId }
): Promise<
  { exceeded: true; current: number; max: number } | { exceeded: false }
> {
  const usage = await selectWorkspaceUsage(workspaceId)
  const current = limit === "members" ? usage.members : usage.actors
  const max = limit === "members" ? limits.maxMembers : limits.maxActors
  if (max < 0) return { exceeded: false }
  return current >= max ? { exceeded: true, current, max } : { exceeded: false }
}
