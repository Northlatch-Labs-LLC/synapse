"use client"

import Link from "next/link"
import { Check } from "lucide-react"

import { LandingReveal } from "@/components/landing-motion"

/**
 * Public pricing section (founder order 2026-09-30): the landing page sells —
 * the three tiers match the in-app Stripe subscription exactly.
 */

const TIERS = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "Everything you need to run your first digital team.",
    features: ["Up to 3 agents", "Up to 3 members", "Gateway auto models"],
    cta: "Start free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$25",
    cadence: "per month",
    blurb: "For solo operators running serious work.",
    features: [
      "Up to 10 agents",
      "Up to 10 members",
      "All gateway models",
      "Priority support",
    ],
    cta: "Go Pro",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$25",
    cadence: "per seat / month",
    blurb: "Unlimited agents for your whole team.",
    features: [
      "Unlimited agents",
      "Unlimited members",
      "All gateway models",
      "Per-seat billing",
    ],
    cta: "Start a team",
    highlighted: false,
  },
]

export function LandingPricingSection() {
  return (
    <section
      id="pricing"
      data-landing-snap-section="true"
      className="relative border-t border-border/50 bg-white/65 py-20 backdrop-blur-sm"
    >
      <LandingReveal className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Simple pricing that scales with your team
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Start free. Upgrade when your digital team outgrows it. Billed
            securely via Stripe — cancel anytime.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-3xl border bg-white/80 p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.5)] backdrop-blur-sm ${
                tier.highlighted
                  ? "border-primary/60 ring-1 ring-primary/30"
                  : "border-border/60"
              }`}
            >
              {tier.highlighted ? (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                  Most popular
                </span>
              ) : null}
              <div className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {tier.name}
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight text-foreground">
                  {tier.price}
                </span>
                <span className="text-sm text-muted-foreground">
                  {tier.cadence}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{tier.blurb}</p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className={`mt-6 inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors ${
                  tier.highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border/70 bg-background/70 text-foreground hover:bg-accent"
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </LandingReveal>
    </section>
  )
}
