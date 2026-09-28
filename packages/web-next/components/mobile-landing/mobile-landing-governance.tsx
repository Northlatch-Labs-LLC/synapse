"use client"

import { useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import {
  ArrowRightLeft,
  BadgeCheck,
  Building2,
  LaptopMinimal,
  LockKeyhole,
  ScrollText,
  UsersRound,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { MobileSection, MobileSectionHeader } from "./mobile-landing-primitives"

const tabs = [
  { id: "env", icon: UsersRound, label: "Environments" },
  { id: "roles", icon: LockKeyhole, label: "Permissions" },
  { id: "audit", icon: ScrollText, label: "Audit" },
] as const

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1]

const roleRows = [
  {
    role: "Platform admin",
    summary: "Manage members, model groups, and platform settings",
    tone: "bg-slate-950 text-white",
  },
  {
    role: "Workspace admin",
    summary: "Install plugins, assign roles, configure resources",
    tone: "bg-sky-100 text-sky-950",
  },
  {
    role: "Member",
    summary: "Start tasks, review results, use granted capabilities",
    tone: "bg-slate-100 text-slate-700",
  },
] as const

const auditItems = [
  {
    time: "09:42",
    action: "Browser Operator installed into the team environment",
    detail: "Initiated by a workspace admin",
  },
  {
    time: "09:45",
    action: "Risk Analyst granted SQL Access",
    detail: "Scope limited to read-only queries",
  },
  {
    time: "09:52",
    action: "Overnight inspection triggered and written to shared memory",
    detail: "Full event trail recorded",
  },
] as const

export function MobileLandingGovernance() {
  const [active, setActive] = useState<(typeof tabs)[number]["id"]>("env")

  return (
    <MobileSection
      id="trust"
      className="bg-[linear-gradient(180deg,rgba(247,250,255,0.55),rgba(255,255,255,0.96))]"
    >
      <MobileSectionHeader
        title="Run a digital team with real-team clarity"
        subtitle="Personal and team side by side · visible permissions · traceable actions"
      />

      <div className="mx-auto mt-7 flex max-w-md rounded-full border border-white/72 bg-white/72 p-1 backdrop-blur">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className="relative flex-1 rounded-full px-2 py-2 text-[12.5px] font-medium transition-colors"
          >
            {active === tab.id ? (
              <m.span
                layoutId="trust-tab-indicator"
                className="absolute inset-0 -z-10 rounded-full bg-slate-950 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.65)]"
                transition={{ duration: 0.36, ease }}
              />
            ) : null}
            <span
              className={cn(
                "relative flex items-center justify-center gap-1.5",
                active === tab.id ? "text-white" : "text-slate-600"
              )}
            >
              <tab.icon className="size-[13px]" />
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      <div className="mx-auto mt-5 max-w-md">
        <AnimatePresence mode="wait">
          {active === "env" ? (
            <m.div
              key="env"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease }}
              className="space-y-3"
            >
              <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.88))] p-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-white text-slate-950 ring-1 ring-slate-200/70">
                    <LaptopMinimal className="size-[15px]" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-slate-950">
                      Personal environment
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Tools for yourself, shareable when needed
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["Personal tools", "Personal memory", "Local devices"].map(
                    (label) => (
                      <span
                        key={label}
                        className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
                      >
                        {label}
                      </span>
                    )
                  )}
                </div>
              </div>

              <div className="flex justify-center">
                <m.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-[0_8px_18px_-12px_rgba(15,23,42,0.22)]"
                >
                  <ArrowRightLeft className="size-3.5" />
                </m.div>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.96),rgba(236,253,245,0.82))] p-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-white text-slate-950 ring-1 ring-sky-200/70">
                    <Building2 className="size-[15px]" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-slate-950">
                      Team environment
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Shared capabilities configured once, reused by everyone
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["Team tools", "Shared roles", "Unified permissions"].map(
                    (label) => (
                      <span
                        key={label}
                        className="rounded-full border border-sky-200/70 bg-white px-2 py-1 text-[11px] text-slate-600"
                      >
                        {label}
                      </span>
                    )
                  )}
                </div>
              </div>
            </m.div>
          ) : null}

          {active === "roles" ? (
            <m.div
              key="roles"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease }}
              className="space-y-2.5"
            >
              {roleRows.map((row, idx) => (
                <m.div
                  key={row.role}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.06, ease }}
                  className="rounded-2xl border border-slate-200 bg-white/92 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-slate-950">
                        {row.role}
                      </div>
                      <div className="mt-1 text-[11.5px] leading-5 text-slate-500">
                        {row.summary}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] leading-none ${row.tone}`}
                    >
                      Active
                    </span>
                  </div>
                </m.div>
              ))}
            </m.div>
          ) : null}

          {active === "audit" ? (
            <m.div
              key="audit"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease }}
              className="space-y-2.5"
            >
              {auditItems.map((item, idx) => (
                <m.div
                  key={item.time}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.06, ease }}
                  className="flex gap-2.5"
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <BadgeCheck className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50/85 p-3">
                    <div className="text-[10px] font-medium text-slate-400">
                      {item.time}
                    </div>
                    <div className="mt-1 text-[12.5px] font-semibold text-slate-950">
                      {item.action}
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-500">
                      {item.detail}
                    </div>
                  </div>
                </m.div>
              ))}
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
    </MobileSection>
  )
}
