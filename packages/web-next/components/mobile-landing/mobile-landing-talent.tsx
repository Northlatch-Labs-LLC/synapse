"use client"

import { useCallback, useEffect, useState } from "react"
import useEmblaCarousel from "embla-carousel-react"
import { m } from "framer-motion"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { MobileSection, MobileSectionHeader } from "./mobile-landing-primitives"

type Role = {
  name: string
  role: string
  initials: string
  summary: string
  tone: string
  accent: string
}

const roles: Role[] = [
  {
    name: "Mira",
    role: "Research scout",
    initials: "MI",
    summary: "Turns fuzzy questions into evidence-backed findings",
    tone: "bg-sky-100 text-sky-950",
    accent: "from-sky-100/70 via-sky-50/40 to-white",
  },
  {
    name: "Orian",
    role: "Delivery coordinator",
    initials: "OR",
    summary: "Breaks goals into owners, milestones, and blockers",
    tone: "bg-amber-100 text-amber-950",
    accent: "from-amber-100/70 via-amber-50/40 to-white",
  },
  {
    name: "Lyra",
    role: "Staff writer",
    initials: "LY",
    summary: "Drafts external copy in your voice, fast",
    tone: "bg-cyan-100 text-cyan-950",
    accent: "from-cyan-100/70 via-cyan-50/40 to-white",
  },
  {
    name: "Kite",
    role: "Data analyst",
    initials: "KI",
    summary: "Translates metric shifts into actionable calls",
    tone: "bg-orange-100 text-orange-950",
    accent: "from-orange-100/70 via-orange-50/40 to-white",
  },
  {
    name: "Soren",
    role: "Risk reviewer",
    initials: "SO",
    summary: "Flags risks and boundary reminders to your standards",
    tone: "bg-emerald-100 text-emerald-950",
    accent: "from-emerald-100/70 via-emerald-50/40 to-white",
  },
  {
    name: "Ivy",
    role: "Project PMO",
    initials: "IV",
    summary: "Tracks status, delays, and owners",
    tone: "bg-violet-100 text-violet-950",
    accent: "from-violet-100/70 via-violet-50/40 to-white",
  },
  {
    name: "Aria",
    role: "Brand editor",
    initials: "AR",
    summary: "Learns your brand voice and no-go phrases",
    tone: "bg-rose-100 text-rose-950",
    accent: "from-rose-100/70 via-rose-50/40 to-white",
  },
  {
    name: "Vega",
    role: "Product analyst",
    initials: "VE",
    summary: "Finds product turning points in behavior signals",
    tone: "bg-sky-100 text-sky-950",
    accent: "from-sky-100/70 via-sky-50/40 to-white",
  },
  {
    name: "Eden",
    role: "CEO assistant",
    initials: "ED",
    summary: "Keeps priorities, meetings, and key to-dos on track",
    tone: "bg-violet-100 text-violet-950",
    accent: "from-violet-100/70 via-violet-50/40 to-white",
  },
]

export function MobileLandingTalent() {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "center",
    skipSnaps: false,
    containScroll: "trimSnaps",
    dragFree: false,
  })
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (!emblaApi) return
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap())
    onSelect()
    emblaApi.on("select", onSelect)
    emblaApi.on("reInit", onSelect)
    return () => {
      emblaApi.off("select", onSelect)
      emblaApi.off("reInit", onSelect)
    }
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    const id = window.setInterval(() => {
      if (document.hidden) return
      emblaApi.scrollNext()
    }, 4500)
    return () => window.clearInterval(id)
  }, [emblaApi])

  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi]
  )

  return (
    <MobileSection id="roles">
      <MobileSectionHeader
        title="Staff a team by role, not a row of bots"
        subtitle="Research, writing, ops, and support roles onboard instantly, with custom roles supported"
      />

      <div className="relative -mx-5 mt-7">
        <div className="overflow-x-clip py-5" ref={emblaRef}>
          <div className="flex">
            {roles.map((role, idx) => (
              <div
                key={role.name}
                className="min-w-0 shrink-0 grow-0 basis-[76%] px-2"
              >
                <m.article
                  animate={{
                    scale: selected === idx ? 1 : 0.93,
                    opacity: selected === idx ? 1 : 0.62,
                  }}
                  transition={{
                    duration: 0.4,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="relative h-full overflow-hidden rounded-[26px] border border-white/72 bg-white/92 p-4 shadow-[0_22px_44px_-28px_rgba(15,23,42,0.5)] backdrop-blur"
                >
                  <div
                    className={cn(
                      "pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br opacity-80",
                      role.accent
                    )}
                  />
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex size-11 items-center justify-center rounded-2xl text-sm font-semibold ring-2 ring-white",
                        role.tone
                      )}
                    >
                      {role.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-slate-950">
                        {role.name}
                      </div>
                      <div className="truncate text-[12px] text-slate-500">
                        {role.role}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-[13px] leading-6 text-slate-700">
                    {role.summary}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="rounded-full border border-white/70 bg-white/80 px-2 py-0.5 backdrop-blur">
                      Can join a workspace
                    </span>
                    <span className="font-medium tracking-wider text-slate-400">
                      0{idx + 1} / 0{roles.length}
                    </span>
                  </div>
                </m.article>
              </div>
            ))}
          </div>
        </div>

        <SwipeHint />

        <div className="mt-2 flex items-center justify-center gap-1.5">
          {roles.map((role, idx) => (
            <button
              key={role.name}
              type="button"
              aria-label={`View ${role.name}`}
              onClick={() => scrollTo(idx)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                idx === selected
                  ? "w-6 bg-slate-950"
                  : "w-1.5 bg-slate-300/80 active:bg-slate-400"
              )}
            />
          ))}
        </div>
      </div>
    </MobileSection>
  )
}

function SwipeHint() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mt-3 flex items-center justify-center gap-2 text-slate-400"
    >
      <m.span
        animate={{ x: [-2, -6, -2] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="inline-flex"
      >
        <ChevronLeft className="size-3.5" />
      </m.span>
      <m.span
        initial={false}
        animate={{ scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        className="block size-1.5 rounded-full bg-slate-400"
      />
      <m.span
        animate={{ x: [2, 6, 2] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="inline-flex"
      >
        <ChevronRight className="size-3.5" />
      </m.span>
    </div>
  )
}
