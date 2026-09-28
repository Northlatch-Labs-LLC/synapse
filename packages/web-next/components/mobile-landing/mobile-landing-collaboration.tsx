"use client"

import { m } from "framer-motion"
import { BrainCircuit, MessageSquareMore, UsersRound } from "lucide-react"

import {
  MobileReveal,
  MobileSection,
  MobileSectionHeader,
} from "./mobile-landing-primitives"

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1]

const features = [
  {
    icon: MessageSquareMore,
    title: "In-chat collaboration",
    text: "Humans and agents advance work in one thread",
  },
  {
    icon: BrainCircuit,
    title: "Shared memory",
    text: "Deliveries persist so the next role can continue",
  },
  {
    icon: UsersRound,
    title: "Visible process",
    text: "Invites and updates land as system messages",
  },
] as const

const stream = [
  { kind: "system", text: "Celine added Brief Writer to the group" },
  {
    kind: "user",
    name: "Celine",
    text: "Draft the board summary first, and write the conclusions and blockers into shared memory.",
  },
  {
    kind: "actor",
    name: "Brief Writer",
    tone: "sky",
    text: "First draft delivered. Key conclusions written back to shared memory.",
    meta: "Shared memory updated",
  },
  { kind: "system", text: "Celine added Risk Analyst to the group" },
  {
    kind: "actor",
    name: "Risk Analyst",
    tone: "amber",
    text: "After reading memory, recommends flagging mobile onboarding as a separate risk.",
  },
] as const

export function MobileLandingCollaboration() {
  return (
    <MobileSection id="collab">
      <MobileSectionHeader
        title="One group chat, one collaboration hub"
        subtitle="Invite, assign, deliver, and persist — all in one place"
      />

      <div className="mx-auto mt-7 grid max-w-md grid-cols-3 gap-2.5">
        {features.map((feature, idx) => (
          <MobileReveal
            key={feature.title}
            y={14}
            delay={0.08 + idx * 0.06}
            className="rounded-2xl border border-white/72 bg-white/85 p-3 text-center shadow-[0_12px_24px_-20px_rgba(15,23,42,0.4)] backdrop-blur"
          >
            <div className="mx-auto flex size-9 items-center justify-center rounded-xl bg-slate-950 text-white">
              <feature.icon className="size-[15px]" />
            </div>
            <div className="mt-2.5 text-[12.5px] font-semibold text-slate-950">
              {feature.title}
            </div>
            <p className="mt-1 text-[11px] leading-[1.4] text-slate-500">
              {feature.text}
            </p>
          </MobileReveal>
        ))}
      </div>

      <MobileReveal
        y={22}
        delay={0.2}
        className="mx-auto mt-7 max-w-[22rem] overflow-hidden rounded-[28px] border border-white/72 bg-white/92 shadow-[0_28px_60px_-32px_rgba(15,23,42,0.4)] backdrop-blur"
      >
        <div className="border-b border-slate-200/70 px-4 py-3">
          <div className="text-[12px] font-semibold text-slate-950">
            Board release briefing
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            System messages stay visible; memory carries the context
          </div>
        </div>
        <div className="space-y-2.5 px-3 py-4">
          {stream.map((item, idx) => {
            if (item.kind === "system") {
              return (
                <m.div
                  key={`sys-${idx}`}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.42, delay: idx * 0.08, ease }}
                  className="px-2 text-center text-[10px] text-slate-400"
                >
                  {item.text}
                </m.div>
              )
            }
            const isUser = item.kind === "user"
            const isSky = "tone" in item && item.tone === "sky"
            return (
              <m.div
                key={`msg-${idx}`}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.48, delay: idx * 0.08, ease }}
                className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}
              >
                <div className="space-y-1">
                  <div
                    className={`text-[9.5px] font-medium text-slate-400 ${isUser ? "text-right" : ""}`}
                  >
                    {item.name}
                  </div>
                  <div
                    className={`max-w-[16rem] rounded-2xl px-3 py-2 text-[12px] leading-[1.55] shadow-[0_8px_22px_-18px_rgba(15,23,42,0.4)] ${
                      isUser
                        ? "rounded-tr-md bg-slate-950 text-white"
                        : isSky
                          ? "rounded-tl-md border border-sky-200/80 bg-sky-50 text-slate-800"
                          : "rounded-tl-md border border-amber-200/80 bg-amber-50 text-slate-800"
                    }`}
                  >
                    {item.text}
                  </div>
                  {"meta" in item && item.meta ? (
                    <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9.5px] leading-none text-emerald-700">
                      {item.meta}
                    </div>
                  ) : null}
                </div>
              </m.div>
            )
          })}
        </div>
      </MobileReveal>
    </MobileSection>
  )
}
