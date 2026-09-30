import { Boxes, LockKeyhole, PlugZap, Search, ShieldCheck } from "lucide-react"

import {
  LandingReveal,
  LandingStagger,
  LandingStaggerItem,
} from "@/components/landing-motion"
import { Card, CardContent } from "@/components/ui/card"

const pluginHighlights = [
  {
    icon: ShieldCheck,
    title: "Officially maintained",
    description:
      "Built-in and officially maintained capabilities work out of the box — no integration layer to build first.",
  },
  {
    icon: PlugZap,
    title: "Install to the workspace",
    description:
      "Plugins land in the workspace first, then get issued by role, session, or team scope.",
  },
  {
    icon: LockKeyhole,
    title: "Unified authorization",
    description:
      "Who can install, who can use, and where it applies — managed in one place.",
  },
] as const

const pluginCards = [
  {
    name: "Zhipu Toolkit",
    summary: "Web search, document reading, OCR, and information collection",
    meta: "Official",
    action: "Install to workspace",
    accent: "bg-sky-100 text-sky-900",
  },
  {
    name: "Browser Operator",
    summary:
      "Lets digital workers drive the browser directly and complete execution tasks on real pages.",
    meta: "Official",
    action: "Grant to roles",
    accent: "bg-emerald-100 text-emerald-900",
  },
  {
    name: "Docs Connector",
    summary:
      "Brings documents, knowledge bases, and attachments into the same workflow.",
    meta: "Frequently used",
    action: "Install and authorize",
    accent: "bg-amber-100 text-amber-900",
  },
  {
    name: "SQL Access",
    summary:
      "Lets analyst and operations roles read structured data within their permissions.",
    meta: "Controlled access",
    action: "Configure access scope",
    accent: "bg-violet-100 text-violet-900",
  },
] as const

export function LandingPluginMarketSection() {
  return (
    <section
      id="plugins"
      data-landing-snap-section="true"
      className="landing-snap-section relative w-full bg-[linear-gradient(180deg,rgba(247,250,255,0.78),rgba(255,255,255,0.92))] py-18"
    >
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.84fr_1.16fr] lg:items-center lg:gap-14">
          <LandingReveal className="max-w-xl" x={-24}>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Plugins land in the workspace first, then go to the roles
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
              Search, install, assign, and authorize in one console. Plugins
              become workspace resources, then get called by the right roles and
              sessions
            </p>

            <LandingStagger className="mt-8 space-y-4" delay={0.08}>
              {pluginHighlights.map((item) => (
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
            <div className="absolute top-8 -left-8 size-36 rounded-full bg-sky-200/35 blur-3xl" />
            <div className="absolute -right-4 bottom-6 size-40 rounded-full bg-emerald-200/30 blur-3xl" />

            <Card className="relative gap-0 rounded-[34px] border border-white/72 bg-white/92 py-0 shadow-[0_40px_110px_-58px_rgba(15,23,42,0.48)]">
              <div className="border-b border-border/50 px-5 pt-4 pb-3 lg:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">
                      Official plugin marketplace
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Install to the workspace first, then assign to digital
                      teams by rule
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-500">
                    <Search className="size-4" />
                    Search official plugins
                  </div>
                </div>
              </div>

              <CardContent className="space-y-3 px-5 pt-3 pb-5 lg:px-6 lg:pt-3 lg:pb-6">
                <LandingReveal
                  className="flex flex-wrap gap-2 text-xs text-slate-500"
                  delay={0.16}
                  y={14}
                >
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    Research
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    Browser
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    Docs
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    Data
                  </span>
                </LandingReveal>

                <LandingStagger
                  className="grid gap-4 sm:grid-cols-2"
                  delay={0.22}
                  stagger={0.08}
                >
                  {pluginCards.map((plugin) => (
                    <LandingStaggerItem
                      key={plugin.name}
                      className="rounded-[26px] border border-slate-200 bg-slate-50/85 p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.32)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className={`flex size-11 items-center justify-center rounded-2xl ${plugin.accent}`}
                        >
                          <Boxes className="size-[18px]" />
                        </div>
                        <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] leading-none text-slate-500">
                          {plugin.meta}
                        </div>
                      </div>
                      <div className="mt-4 text-base font-semibold text-slate-950">
                        {plugin.name}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {plugin.summary}
                      </p>
                      <div className="mt-4 inline-flex rounded-full bg-slate-950 px-3 py-1.5 text-[11px] leading-none text-white">
                        {plugin.action}
                      </div>
                    </LandingStaggerItem>
                  ))}
                </LandingStagger>
              </CardContent>
            </Card>
          </LandingReveal>
        </div>
      </div>
    </section>
  )
}
