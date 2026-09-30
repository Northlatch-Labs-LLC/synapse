import type { Metadata } from "next"

export const metadata: Metadata = { title: "Terms of Service" }

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Effective 2026-09-30 · Northlatch Labs LLC · synappse.work
      </p>
      <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            1. The service
          </h2>
          <p className="mt-2">
            Synappse is an AI team workspace provided by Northlatch Labs LLC. By
            creating an account you agree to these terms. You must be at least
            16 years old and able to form a binding contract.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            2. Your content
          </h2>
          <p className="mt-2">
            You own the content you create in workspaces. You grant us the
            limited right to process and store it solely to operate the service.
            You are responsible for the content you and your digital teammates
            generate, and for the instructions you give them.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            3. Acceptable use
          </h2>
          <p className="mt-2">
            Do not use Synappse to break the law, infringe others&apos; rights,
            attempt to gain unauthorized access to systems or data, probe or
            scan the service without written permission, or host malicious
            content. We may suspend accounts that violate these rules.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            4. Plans and billing
          </h2>
          <p className="mt-2">
            Paid plans (Pro, Team) renew monthly until cancelled and are billed
            through Stripe. Taxes may apply. You can cancel at any time from
            your billing portal; cancellation takes effect at the end of the
            current period.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            5. Availability and liability
          </h2>
          <p className="mt-2">
            We aim for high availability but provide the service &quot;as
            is&quot; without warranties of any kind to the extent permitted by
            law. Our aggregate liability is limited to the amounts you paid us
            in the 12 months preceding a claim. We are not liable for indirect
            or consequential damages.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            6. Termination
          </h2>
          <p className="mt-2">
            You may close your account at any time. We may terminate accounts
            for material breaches of these terms after notice where feasible.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
          <p className="mt-2">
            Questions: ops@northlatch.com. These terms are governed by the laws
            applicable at the registered seat of Northlatch Labs LLC, without
            prejudice to mandatory consumer-protection rights.
          </p>
        </section>
      </div>
    </div>
  )
}
