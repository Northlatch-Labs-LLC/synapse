import {
  AlarmClockCheck,
  ArrowRight,
  BellRing,
  MessageSquareText,
  ServerCog,
  Workflow,
} from "lucide-react"

import {
  LandingReveal,
  LandingStagger,
  LandingStaggerItem,
} from "@/components/landing-motion"
import { cn } from "@/lib/utils"

const eventHighlights = [
  {
    icon: BellRing,
    title: "Multi-source triggers",
    description:
      "People, services, messages, and system signals can all start work.",
  },
  {
    icon: Workflow,
    title: "Automatic spin-up",
    description:
      "When an event lands, the group, roles, and resources assemble themselves.",
  },
  {
    icon: AlarmClockCheck,
    title: "Always on duty",
    description:
      "Scheduled jobs, webhooks, and system state changes run long-term and wake the team.",
  },
] as const

const eventSources = [
  {
    icon: ServerCog,
    title: "Custom server push",
    meta: "Push exception events straight into the active runtime.",
    badge: "Triggered",
    active: true,
  },
  {
    icon: MessageSquareText,
    title: "Feishu IM integration",
    meta: "Group messages, @ mentions, and bot commands all plug in.",
    badge: "Standing by",
    active: false,
  },
  {
    icon: AlarmClockCheck,
    title: "Scheduled triggers",
    meta: "Inspections, daily reports, and recurring tasks start on schedule.",
    badge: "Configured",
    active: false,
  },
] as const

const workflowSteps = [
  {
    title: "Create the incident group",
    meta: "The system spins up the war room.",
    state: "done",
  },
  {
    title: "Pull in the on-call SRE",
    meta: "The on-call role joins automatically.",
    state: "done",
  },
  {
    title: "Query the internal log service",
    meta: "Error logs queried through local access.",
    state: "active",
  },
  {
    title: "Pull in diagnostic roles",
    meta: "Database and service diagnostics added by rule.",
    state: "pending",
  },
  {
    title: "Update shared memory",
    meta: "Conclusions and blockers written back to shared memory.",
    state: "pending",
  },
] as const

export function LandingEventDrivenSection() {
  return (
    <section
      id="events"
      data-landing-snap-section="true"
      className="landing-snap-section relative w-full bg-[linear-gradient(180deg,rgba(246,250,255,0.82),rgba(255,255,255,0.94))] py-18"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.1),transparent_34%)]" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-14">
          <LandingReveal className="max-w-xl" x={-24}>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Work doesn't have to start with a prompt — events can wake the
              team
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
              Scheduled jobs, webhooks, IM messages, and system signals flow
              into the same runtime — opening groups, pulling people in, and
              connecting resources
            </p>

            <LandingStagger className="mt-8 space-y-4" delay={0.08}>
              {eventHighlights.map((item) => (
                <LandingStaggerItem key={item.title} className="flex gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/10">
                    <item.icon className="size-[18px]" />
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-slate-950">
                      {item.title}
                    </div>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">
                      {item.description}
                    </p>
                  </div>
                </LandingStaggerItem>
              ))}
            </LandingStagger>
          </LandingReveal>

          <LandingReveal
            className="relative"
            delay={0.08}
            x={28}
            y={24}
            scale={0.985}
          >
            <div className="absolute top-10 -left-8 size-36 rounded-full bg-sky-200/34 blur-3xl" />
            <div className="absolute -right-4 bottom-8 size-40 rounded-full bg-emerald-200/30 blur-3xl" />

            <div className="relative">
              <div className="grid gap-4 xl:grid-cols-[0.9fr_auto_1.1fr] xl:items-start">
                <LandingStagger
                  className="space-y-3"
                  delay={0.16}
                  stagger={0.08}
                >
                  {eventSources.map((source) => (
                    <LandingStaggerItem
                      key={source.title}
                      className={cn(
                        "rounded-[24px] border border-slate-200 bg-slate-50/88 p-4 shadow-[0_18px_36px_-32px_rgba(15,23,42,0.28)]",
                        source.active && "border-sky-200 bg-sky-50/72"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex size-10 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/70">
                          <source.icon className="size-[18px]" />
                        </div>
                        <div
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] leading-none",
                            source.active
                              ? "border-sky-200 bg-sky-100 text-sky-700"
                              : "border-slate-200 bg-white text-slate-500"
                          )}
                        >
                          {source.badge}
                        </div>
                      </div>
                      <div className="mt-3 text-sm font-semibold text-slate-950">
                        {source.title}
                      </div>
                      <div className="mt-1.5 text-[13px] leading-5 text-slate-600">
                        {source.meta}
                      </div>
                    </LandingStaggerItem>
                  ))}
                </LandingStagger>

                <LandingReveal
                  className="hidden h-full items-center justify-center xl:flex"
                  delay={0.34}
                  x={12}
                  y={0}
                >
                  <div className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.22)]">
                    <ArrowRight className="size-4" />
                  </div>
                </LandingReveal>

                <LandingReveal
                  className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,251,255,0.96),rgba(240,247,255,0.88))] p-4 shadow-[0_24px_48px_-38px_rgba(15,23,42,0.32)]"
                  delay={0.28}
                  x={22}
                  y={0}
                  scale={0.99}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">
                        Automated workflow
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Currently triggered by server push
                      </div>
                    </div>
                    <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] leading-none text-emerald-700">
                      Running
                    </div>
                  </div>

                  <div className="mt-4 rounded-[22px] border border-slate-200 bg-white/88 p-4">
                    <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
                      <ServerCog className="size-4 text-slate-700" />
                      PROD API / CPU anomaly
                    </div>

                    <LandingStagger
                      className="mt-3 space-y-3"
                      delay={0.12}
                      stagger={0.07}
                    >
                      {workflowSteps.map((step) => (
                        <LandingStaggerItem
                          key={step.title}
                          className="flex gap-3"
                        >
                          <div className="pt-1">
                            <div
                              className={cn(
                                "size-2.5 rounded-full bg-slate-200",
                                step.state === "done" && "bg-slate-950",
                                step.state === "active" &&
                                  "bg-emerald-500 ring-4 ring-emerald-100"
                              )}
                            />
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold text-slate-950">
                              {step.title}
                            </div>
                            <div className="mt-1 text-[12px] leading-5 text-slate-500">
                              {step.meta}
                            </div>
                          </div>
                        </LandingStaggerItem>
                      ))}
                    </LandingStagger>
                  </div>
                </LandingReveal>
              </div>
            </div>
          </LandingReveal>
        </div>
      </div>
    </section>
  )
}
