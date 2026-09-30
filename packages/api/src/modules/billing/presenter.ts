import { serializeOptionalInstant } from "../../infrastructure/datetime.js"
import type {
  BillingSubscriptionView,
  BillingUsageView,
} from "@synapse/shared/schemas"
import type { WorkspaceSubscriptionRow } from "./repo.js"

/**
 * View assembly for billing responses. Instant serialization lives here
 * (guard-layering r3: serialize* only in presenters and repos).
 */

export function presentSubscription(
  row: WorkspaceSubscriptionRow | undefined,
  usage: BillingUsageView
): BillingSubscriptionView {
  const plan = row?.plan ?? "free"
  const status = row?.status ?? "active"
  const effectivePlan =
    plan !== "free" && status !== "active" && status !== "trialing"
      ? "free"
      : plan
  return {
    workspaceId: row?.workspaceId ?? "",
    plan: effectivePlan,
    status,
    seatQuantity: row?.seatQuantity ?? 1,
    currentPeriodStart:
      serializeOptionalInstant(row?.currentPeriodStart ?? null) ?? null,
    currentPeriodEnd:
      serializeOptionalInstant(row?.currentPeriodEnd ?? null) ?? null,
    cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
    usage,
  }
}
