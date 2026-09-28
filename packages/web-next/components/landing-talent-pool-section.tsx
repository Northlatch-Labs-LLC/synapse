import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LandingReveal } from "@/components/landing-motion"
import { cn } from "@/lib/utils"

type TalentCard = {
  name: string
  role: string
  initials: string
  summary: string
  tone: string
}

const firstRowTalents: TalentCard[] = [
  {
    name: "Mira",
    role: "Research scout",
    initials: "MI",
    summary: "Turns fuzzy questions into evidence-backed conclusions",
    tone: "bg-sky-100 text-sky-950",
  },
  {
    name: "Orian",
    role: "Delivery coordinator",
    initials: "OR",
    summary: "Breaks goals into owners, milestones, and blockers",
    tone: "bg-amber-100 text-amber-950",
  },
  {
    name: "Lyra",
    role: "Lead writer",
    initials: "LY",
    summary: "Drafts external copy in your voice, fast",
    tone: "bg-cyan-100 text-cyan-950",
  },
  {
    name: "Kite",
    role: "Data analyst",
    initials: "KI",
    summary: "Turns metric movement into actionable calls",
    tone: "bg-orange-100 text-orange-950",
  },
  {
    name: "Nora",
    role: "User researcher",
    initials: "NO",
    summary: "Remembers your user segments and interview preferences",
    tone: "bg-primary/10 text-primary",
  },
  {
    name: "Soren",
    role: "Risk reviewer",
    initials: "SO",
    summary: "Flags risks and boundary cases to your standards",
    tone: "bg-emerald-100 text-emerald-950",
  },
  {
    name: "Ivy",
    role: "Project PMO",
    initials: "IV",
    summary: "Tracks status, delays, and owners across every thread",
    tone: "bg-violet-100 text-violet-950",
  },
] as const

const secondRowTalents: TalentCard[] = [
  {
    name: "Aria",
    role: "Brand editor",
    initials: "AR",
    summary: "Learns your brand voice and off-limit phrasing",
    tone: "bg-rose-100 text-rose-950",
  },
  {
    name: "Flint",
    role: "Growth strategist",
    initials: "FL",
    summary: "Breaks growth targets into concrete experiments and actions",
    tone: "bg-amber-100 text-amber-950",
  },
  {
    name: "Vega",
    role: "Product analyst",
    initials: "VE",
    summary: "Finds product inflection points in behavioral signals",
    tone: "bg-sky-100 text-sky-950",
  },
  {
    name: "Elsa",
    role: "Support coach",
    initials: "EL",
    summary: "Turns recurring questions into shared scripts and SOPs",
    tone: "bg-cyan-100 text-cyan-950",
  },
  {
    name: "Rowan",
    role: "Recruiting assistant",
    initials: "RO",
    summary:
      "Screens, schedules interviews, and follows up to your preferences",
    tone: "bg-orange-100 text-orange-950",
  },
  {
    name: "Quinn",
    role: "Business researcher",
    initials: "QU",
    summary: "Fills in customer, market, and partnership context fast",
    tone: "bg-emerald-100 text-emerald-950",
  },
  {
    name: "Cora",
    role: "Operations lead",
    initials: "CO",
    summary: "Keeps complex collaboration moving on one line",
    tone: "bg-primary/10 text-primary",
  },
] as const

const thirdRowTalents: TalentCard[] = [
  {
    name: "Nova",
    role: "Market intelligence lead",
    initials: "NV",
    summary: "Tracks market shifts and competitor moves over time",
    tone: "bg-sky-100 text-sky-950",
  },
  {
    name: "Theo",
    role: "Finance advisor",
    initials: "TH",
    summary: "Breaks numbers into budget, risk, and efficiency calls",
    tone: "bg-amber-100 text-amber-950",
  },
  {
    name: "June",
    role: "Social media editor",
    initials: "JU",
    summary: "Keeps producing short-form content in your style",
    tone: "bg-cyan-100 text-cyan-950",
  },
  {
    name: "Sasha",
    role: "Customer success manager",
    initials: "SA",
    summary: "Tracks delivery outcomes against user goals",
    tone: "bg-orange-100 text-orange-950",
  },
  {
    name: "Finn",
    role: "Sales researcher",
    initials: "FI",
    summary: "Builds customer context before your conversations",
    tone: "bg-primary/10 text-primary",
  },
  {
    name: "Lumi",
    role: "Creative director",
    initials: "LU",
    summary: "Turns your taste into creative judgment",
    tone: "bg-emerald-100 text-emerald-950",
  },
  {
    name: "Eden",
    role: "CEO assistant",
    initials: "ED",
    summary: "Tracks priorities, meetings, and key to-dos",
    tone: "bg-violet-100 text-violet-950",
  },
] as const

function TalentPoolCard({ card }: { card: TalentCard }) {
  return (
    <article className="w-[var(--talent-card-width)] shrink-0 rounded-[28px] border border-white/78 bg-white/90 p-4 shadow-[0_28px_80px_-54px_rgba(15,23,42,0.42)] backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <Avatar className="size-10 ring-2 ring-white">
          <AvatarFallback className={cn("text-sm font-semibold", card.tone)}>
            {card.initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-slate-950">
            {card.name}
          </div>
          <div className="truncate text-sm text-slate-500">{card.role}</div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-700">{card.summary}</p>
    </article>
  )
}

function TalentRow({
  cards,
  shifted = false,
}: {
  cards: readonly TalentCard[]
  shifted?: boolean
}) {
  return (
    <div className="overflow-hidden">
      <div className="relative left-1/2 w-max -translate-x-1/2">
        <div
          className={cn(
            "flex gap-[var(--talent-gap)]",
            shifted &&
              "[transform:translateX(calc((var(--talent-card-width)+var(--talent-gap))/2))]"
          )}
        >
          {cards.map((card) => (
            <TalentPoolCard key={`${card.name}-${card.role}`} card={card} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function LandingTalentPoolSection() {
  return (
    <section
      id="capabilities"
      data-landing-snap-section="true"
      className="landing-snap-section relative border-y border-border/50 bg-[linear-gradient(180deg,rgba(247,250,255,0.9),rgba(255,255,255,0.96))] py-18"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.12),transparent_34%)]" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <LandingReveal className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Build teams by role, not a pile of bots
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
            Research, writing, operations, support, and recruiting roles start
            on day one, then keep growing with your memory, permissions, and
            workflows
          </p>
        </LandingReveal>
      </div>

      <div className="relative left-1/2 mt-12 w-screen -translate-x-1/2 overflow-hidden [--talent-card-width:15rem] [--talent-gap:1rem] sm:[--talent-card-width:16.75rem] sm:[--talent-gap:1.25rem]">
        <div className="space-y-4 sm:space-y-5">
          <LandingReveal y={24} x={-36} delay={0.06}>
            <TalentRow cards={firstRowTalents} />
          </LandingReveal>
          <LandingReveal y={24} x={36} delay={0.14}>
            <TalentRow cards={secondRowTalents} shifted />
          </LandingReveal>
          <LandingReveal y={24} x={-36} delay={0.22}>
            <TalentRow cards={thirdRowTalents} />
          </LandingReveal>
        </div>
      </div>
    </section>
  )
}
