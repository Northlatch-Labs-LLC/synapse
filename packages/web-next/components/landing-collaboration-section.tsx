import { BrainCircuit, MessageSquareMore, UsersRound } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
} from "@/components/ui/avatar"
import {
  LandingReveal,
  LandingStagger,
  LandingStaggerItem,
} from "@/components/landing-motion"
import { Card, CardContent } from "@/components/ui/card"

const collaborationFeatures = [
  {
    icon: MessageSquareMore,
    title: "Work in one thread",
    description: "Humans and agents push work forward in the same thread",
  },
  {
    icon: BrainCircuit,
    title: "Shared memory",
    description:
      "Deliverables are written back to memory, so the next role picks up where the last one stopped",
  },
  {
    icon: UsersRound,
    title: "Visible process",
    description: "System messages make it clear who joined and what changed",
  },
] as const

const collaborationParticipants = [
  { name: "Celine", initials: "CE", tone: "bg-slate-950 text-white" },
  { name: "Brief Writer", initials: "BW", tone: "bg-sky-100 text-sky-950" },
  { name: "Risk Analyst", initials: "RA", tone: "bg-amber-100 text-amber-950" },
] as const

type CollaborationMessage =
  | {
      kind: "system"
      content: string
    }
  | {
      kind: "user" | "actor"
      name: string
      initials: string
      tone: string
      content: string
      meta?: string
    }

const collaborationMessages: CollaborationMessage[] = [
  {
    kind: "system",
    content: "Celine added Brief Writer to the group",
  },
  {
    kind: "user",
    name: "Celine",
    initials: "CE",
    tone: "bg-slate-950 text-white",
    content:
      "Draft the board release summary first, and write the conclusions and blockers into shared memory.",
  },
  {
    kind: "actor",
    name: "Brief Writer",
    initials: "BW",
    tone: "bg-sky-100 text-sky-950",
    content:
      "Draft submitted. Key conclusions and current blockers are written back to shared memory, so the next role can pick up directly.",
    meta: "Delivered · Shared memory updated",
  },
  {
    kind: "system",
    content: "Brief Writer updated the shared memory",
  },
  {
    kind: "system",
    content: "Celine added Risk Analyst to the group",
  },
  {
    kind: "user",
    name: "Celine",
    initials: "CE",
    tone: "bg-slate-950 text-white",
    content:
      "@Risk Analyst add a risk assessment based on the current shared memory.",
  },
  {
    kind: "actor",
    name: "Risk Analyst",
    initials: "RA",
    tone: "bg-amber-100 text-amber-950",
    content:
      "I've read the shared memory: the main risk is the mobile onboarding drop-off. I suggest a dedicated risk section with ETA notes.",
  },
]

function DemoAvatar({
  initials,
  tone,
  active = false,
}: {
  initials: string
  tone: string
  active?: boolean
}) {
  return (
    <Avatar className="size-8 ring-2 ring-white">
      <AvatarFallback className={cn("text-[11px] font-semibold", tone)}>
        {initials}
      </AvatarFallback>
      {active ? <AvatarBadge className="bg-emerald-400 ring-white" /> : null}
    </Avatar>
  )
}

export function LandingCollaborationSection() {
  return (
    <section
      id="difference"
      data-landing-snap-section="true"
      className="landing-snap-section relative border-y border-border/50 bg-white/68 py-18 backdrop-blur-sm"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.12),transparent_34%)]" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-14">
          <LandingReveal className="max-w-xl" x={-24}>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              One group chat is where the work happens
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
              Pull people in, assign work, deliver, and build memory in one
              place — no switching between bots and docs
            </p>

            <LandingStagger className="mt-7 space-y-4" delay={0.08}>
              {collaborationFeatures.map((feature) => (
                <LandingStaggerItem key={feature.title} className="flex gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/10">
                    <feature.icon className="size-[18px]" />
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-slate-950">
                      {feature.title}
                    </div>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">
                      {feature.description}
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
            y={26}
            scale={0.985}
          >
            <div className="absolute top-10 -left-10 size-36 rounded-full bg-sky-200/38 blur-3xl" />
            <div className="absolute -right-4 bottom-8 size-36 rounded-full bg-emerald-200/36 blur-3xl" />

            <Card className="relative gap-0 rounded-[34px] border border-white/72 bg-white/92 py-0 shadow-[0_40px_110px_-58px_rgba(15,23,42,0.48)]">
              <div className="border-b border-border/50 px-5 pt-4 pb-3 lg:px-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">
                      Board release summary
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      System messages stay visible; shared memory carries the
                      context
                    </div>
                  </div>
                  <AvatarGroup>
                    {collaborationParticipants.map((participant) => (
                      <DemoAvatar
                        key={participant.name}
                        initials={participant.initials}
                        tone={participant.tone}
                      />
                    ))}
                  </AvatarGroup>
                </div>
              </div>

              <CardContent className="px-5 pt-3 pb-5 lg:px-6 lg:pt-3 lg:pb-6">
                <LandingStagger
                  className="space-y-3.5"
                  delay={0.16}
                  stagger={0.08}
                >
                  {collaborationMessages.map((message, index) => {
                    if (message.kind === "system") {
                      return (
                        <LandingStaggerItem
                          key={`system-${index}`}
                          className="px-3 text-center text-[11px] leading-5 text-slate-400"
                        >
                          {message.content}
                        </LandingStaggerItem>
                      )
                    }

                    const isUser = message.kind === "user"

                    return (
                      <LandingStaggerItem
                        key={`${message.name}-${index}`}
                        className={cn(
                          "flex gap-3",
                          isUser && "flex-row-reverse"
                        )}
                      >
                        <div className="pt-1">
                          <DemoAvatar
                            initials={message.initials}
                            tone={message.tone}
                            active={!isUser}
                          />
                        </div>

                        <div
                          className={cn(
                            "max-w-[84%] space-y-1.5",
                            isUser && "text-right"
                          )}
                        >
                          <div className="text-[11px] font-medium text-slate-500">
                            {message.name}
                          </div>
                          <div
                            className={cn(
                              "rounded-[22px] border px-3.5 py-3 text-[13px] leading-6 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.32)]",
                              isUser
                                ? "rounded-tr-sm border-slate-950/0 bg-slate-950 text-white"
                                : "rounded-tl-sm border-slate-200 bg-slate-50 text-slate-800"
                            )}
                          >
                            {message.content}
                          </div>

                          {message.meta ? (
                            <div
                              className={cn(
                                "inline-flex rounded-full border px-2.5 py-1 text-[11px] leading-none",
                                isUser
                                  ? "border-slate-300 bg-white text-slate-500"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                              )}
                            >
                              {message.meta}
                            </div>
                          ) : null}
                        </div>
                      </LandingStaggerItem>
                    )
                  })}
                </LandingStagger>
              </CardContent>
            </Card>
          </LandingReveal>
        </div>
      </div>
    </section>
  )
}
