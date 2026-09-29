"use client"

import type {
  BillingPlanView,
  BillingPlansView,
  BillingSubscriptionView,
} from "@synapse/shared/schemas"
import { useEffect, useState, useCallback } from "react"
import { useWorkspace } from "../../workspace-provider"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Crown, Check } from "lucide-react"
import { createLogger } from "@/lib/client-logger"

const clientLog = createLogger("web.dashboard.settings.billing")

function priceLabel(plan: BillingPlanView): string {
  if (plan.priceUsdCentsMonthly === 0) return "Free"
  const usd = (plan.priceUsdCentsMonthly / 100).toFixed(0)
  return plan.perSeat ? `$${usd}/seat/mo` : `$${usd}/mo`
}

function limitLabel(value: number): string {
  return value === -1 ? "Unlimited" : String(value)
}

export default function BillingSettingsPage() {
  const { workspaceId } = useWorkspace()
  const [plans, setPlans] = useState<BillingPlansView | null>(null)
  const [subscription, setSubscription] =
    useState<BillingSubscriptionView | null>(null)
  const [loading, setLoading] = useState(true)
  const [seats, setSeats] = useState("3")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) return
    try {
      const [plansData, subData] = await Promise.all([
        api.getBillingPlans(workspaceId),
        api.getBillingSubscription(workspaceId),
      ])
      setPlans(plansData)
      setSubscription(subData)
    } catch (err) {
      clientLog.error("Failed to load billing:", err)
      setError("Could not load billing information.")
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    load()
    // Re-sync after returning from Stripe checkout/portal redirects.
    if (
      typeof window !== "undefined" &&
      window.location.search.includes("checkout=")
    ) {
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [load])

  const startCheckout = async (plan: "pro" | "team") => {
    if (!workspaceId) return
    setBusy(plan)
    setError(null)
    try {
      const body: { plan: "pro" | "team"; seats?: number } = { plan }
      if (plan === "team") body.seats = Math.max(3, parseInt(seats, 10) || 3)
      const { url } = await api.createBillingCheckout(workspaceId, body)
      window.location.href = url
    } catch (err) {
      clientLog.error("Checkout failed:", err)
      setError("Checkout could not start. You must be the workspace owner.")
      setBusy(null)
    }
  }

  const openPortal = async () => {
    if (!workspaceId) return
    setBusy("portal")
    setError(null)
    try {
      const { url } = await api.createBillingPortal(workspaceId)
      window.location.href = url
    } catch (err) {
      clientLog.error("Portal failed:", err)
      setError("Billing portal could not open.")
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading billing…</div>
    )
  }

  const currentPlan = subscription?.plan ?? "free"

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Plan &amp; Subscription</h2>
        <p className="text-sm text-muted-foreground">
          Upgrade, manage payment methods, or cancel at any time. Billed by
          Northlatch via Stripe.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {subscription ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Current subscription</CardTitle>
            <Badge variant={currentPlan === "free" ? "secondary" : "default"}>
              {currentPlan === "free"
                ? "Free"
                : currentPlan === "pro"
                  ? "Pro"
                  : "Team"}
              {subscription.cancelAtPeriodEnd && currentPlan !== "free"
                ? " · cancels at period end"
                : ""}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground">Usage:</span>
              <span>
                {subscription.usage.members} members ·{" "}
                {subscription.usage.actors} agents
              </span>
            </div>
            {subscription.currentPeriodEnd && (
              <div className="flex gap-2">
                <span className="text-muted-foreground">Renews:</span>
                <span>
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </span>
              </div>
            )}
            {currentPlan !== "free" && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openPortal}
                  disabled={busy === "portal"}
                >
                  {busy === "portal"
                    ? "Opening…"
                    : "Manage billing (card, invoices, cancel)"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {plans?.plans.map((plan) => {
          const isCurrent = plan.plan === currentPlan
          return (
            <Card
              key={plan.plan}
              className={isCurrent ? "border-primary" : undefined}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{plan.displayName}</CardTitle>
                {isCurrent && <Crown className="h-4 w-4 text-primary" />}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="text-2xl font-semibold">{priceLabel(plan)}</div>
                <ul className="space-y-1 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3" /> {limitLabel(plan.maxActors)}{" "}
                    agents
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3" /> {limitLabel(plan.maxMembers)}{" "}
                    members
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3" />
                    {plan.modelsTier === "all"
                      ? "All gateway models"
                      : "Auto gateway models"}
                  </li>
                </ul>
                {plan.plan !== "free" && !isCurrent ? (
                  <div className="space-y-2 pt-1">
                    {plan.plan === "team" && (
                      <Input
                        type="number"
                        min={3}
                        value={seats}
                        onChange={(e) => setSeats(e.target.value)}
                        aria-label="Seats"
                      />
                    )}
                    <Button
                      className="w-full"
                      size="sm"
                      disabled={!plans.stripeConfigured || busy === plan.plan}
                      onClick={() => startCheckout(plan.plan as "pro" | "team")}
                    >
                      {busy === plan.plan
                        ? "Redirecting…"
                        : plans.stripeConfigured
                          ? `Upgrade to ${plan.displayName}`
                          : "Billing not configured"}
                    </Button>
                  </div>
                ) : null}
                {isCurrent ? (
                  <div className="pt-1 text-xs text-muted-foreground">
                    Your current plan
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
