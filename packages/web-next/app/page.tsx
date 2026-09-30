import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Github } from "lucide-react"

import { LandingCollaborationSection } from "@/components/landing-collaboration-section"
import { LandingEventDrivenSection } from "@/components/landing-event-driven-section"
import { LandingHeroHeadline } from "@/components/landing-hero-headline"
import { LandingHeroStack } from "@/components/landing-hero-stack"
import { LandingLocalAccessSection } from "@/components/landing-local-access-section"
import { LandingMotionProvider } from "@/components/landing-motion-provider"
import { LandingPricingSection } from "@/components/landing-pricing-section"
import { LandingPluginMarketSection } from "@/components/landing-plugin-market-section"
import { LandingReveal } from "@/components/landing-motion"
import { LandingShareNetworkSection } from "@/components/landing-share-network-section"
import { LandingSnapScrollController } from "@/components/landing-snap-scroll-controller"
import { LandingTalentPoolSection } from "@/components/landing-talent-pool-section"
import { LandingTeamGovernanceSection } from "@/components/landing-team-governance-section"
import { DesktopMobileHint } from "@/components/desktop-mobile-hint"
import { RepoLinkStaticRedirect } from "@/components/repo-link-static-redirect"
import { Button } from "@/components/ui/button"
import { IS_REPO_LINK_MODE, SYNAPSE_REPO_URL } from "@/lib/repo-link-mode"

export const metadata: Metadata = {
  title: "Turn AI into a Team",
  description:
    "Synappse is the AI collaboration runtime for teams — shareable coworkers, memory, authorizations, plugins, local execution, and remote agents, all working together in one hub.",
}

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f3f9ff_0%,#f6f8fb_36%,#ffffff_100%)] text-foreground">
      <RepoLinkStaticRedirect page="desktop" />
      <LandingSnapScrollController />
      <LandingMotionProvider>
        <div className="light">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[42rem] bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.2),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.04),transparent_62%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.7),transparent_85%)] bg-[size:28px_28px]" />

        <header className="fixed inset-x-0 top-4 z-40 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 rounded-full border border-white/70 bg-white/58 px-5 py-3 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.55)] backdrop-blur-2xl lg:px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <Image src="/synapse.svg" alt="Synappse" width={28} height={28} />
              <div className="font-display text-lg font-semibold tracking-tight text-foreground">
                Synappse
              </div>
            </Link>

            <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
              <Link
                href="#difference"
                className="transition-colors hover:text-foreground/90"
              >
                Collaboration
              </Link>
              <Link
                href="#sharing"
                className="transition-colors hover:text-foreground/90"
              >
                Sharing
              </Link>
              <Link
                href="#capabilities"
                className="transition-colors hover:text-foreground/90"
              >
                Roles
              </Link>
              <Link
                href="#plugins"
                className="transition-colors hover:text-foreground/90"
              >
                Plugins
              </Link>
              <Link
                href="#reach"
                className="transition-colors hover:text-foreground/90"
              >
                Execution
              </Link>
              <Link
                href="#events"
                className="transition-colors hover:text-foreground/90"
              >
                Events
              </Link>
              <Link
                href="#trust"
                className="transition-colors hover:text-foreground/90"
              >
                Governance
              </Link>
              <Link
                href="#pricing"
                className="transition-colors hover:text-foreground/90"
              >
                Pricing
              </Link>
            </nav>
            <Link
              href="/login"
              className="shrink-0 rounded-full border border-border/70 bg-background/70 px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Sign in
            </Link>
          </div>
        </header>

        <section
          data-landing-snap-section="true"
          className="landing-snap-section relative mx-auto max-w-7xl px-6 pt-28 pb-18 lg:px-8 lg:pt-32 lg:pb-24"
        >
          <div className="landing-priority-frame flex flex-col gap-8 lg:gap-12">
            <div className="landing-priority-copy mx-auto max-w-4xl text-center">
              <div style={{ animationDelay: "80ms" }}>
                <LandingHeroHeadline />
              </div>

              <p
                className="animate-fade-up mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg"
                style={{ animationDelay: "160ms" }}
              >
                Not another chat window — roles, group chats, memory,
                authorizations, and execution, all inside one AI organization
                runtime
              </p>

              <div
                className="animate-fade-up mt-8 flex flex-wrap items-center justify-center gap-3"
                style={{ animationDelay: "240ms" }}
              >
                {IS_REPO_LINK_MODE ? (
                  <Button asChild size="lg">
                    <a
                      href={SYNAPSE_REPO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Github data-icon="inline-start" className="size-4" />
                      Open source on GitHub
                    </a>
                  </Button>
                ) : (
                  <Button asChild size="lg">
                    <Link href="/register">Create a team</Link>
                  </Button>
                )}
                <Button asChild size="lg" variant="secondary">
                  <Link href="#trust">Learn about self-hosting</Link>
                </Button>
              </div>
            </div>

            <div className="landing-priority-showcase">
              <LandingHeroStack />
            </div>
          </div>
        </section>

        <LandingCollaborationSection />

        <LandingShareNetworkSection />

        <LandingTalentPoolSection />

        <LandingPluginMarketSection />

        <LandingLocalAccessSection />

        <LandingEventDrivenSection />

        <LandingTeamGovernanceSection />

        <LandingPricingSection />

        <section
          data-landing-tail="true"
          className="relative border-t border-border/50 bg-white/65 py-18 backdrop-blur-sm"
        >
          <LandingReveal
            className="mx-auto max-w-5xl px-6 text-center lg:px-8"
            y={28}
          >
            <h2 className="font-display text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Turn AI from a chat window into a team capability
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-600">
              No more improvising workflows around a single bot — bring roles,
              memory, resource authorizations, event triggers, and execution
              environments into the same hub
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {IS_REPO_LINK_MODE ? (
                <Button asChild size="lg">
                  <a
                    href={SYNAPSE_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github data-icon="inline-start" className="size-4" />
                    Open source on GitHub
                  </a>
                </Button>
              ) : (
                <Button asChild size="lg">
                  <Link href="/register">Create a team</Link>
                </Button>
              )}
              <Button asChild size="lg" variant="outline">
                <Link href="#trust">Learn about self-hosting</Link>
              </Button>
            </div>
          </LandingReveal>
        </section>

        <DesktopMobileHint />
      </div>
      </LandingMotionProvider>
    </main>
  )
}
