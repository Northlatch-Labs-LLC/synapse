import type { Metadata } from "next"

export const metadata: Metadata = { title: "Privacy Policy" }

const SECTIONS: Array<{ id?: string; heading: string; body: string[] }> = [
  {
    heading: "1. Who we are",
    body: [
      'Synappse is operated by Northlatch Labs LLC ("Northlatch", "we", "us"). Northlatch is the data controller for personal data processed through the Synappse service at synappse.work. Contact: privacy@northlatch.com.',
    ],
  },
  {
    heading: "2. Data we process",
    body: [
      "Account data: your name, email address, and (optional) phone number used for sign-in, plus authentication session records.",
      "Workspace content: the conversations, messages, files, skills, memories, and configuration you and your digital teammates create inside workspaces.",
      "Operational data: security audit records, billing status via our payment processor Stripe (we never store card numbers), and technical logs required to run the service.",
    ],
  },
  {
    heading: "3. Why we process it",
    body: [
      "To provide the service you signed up for (performance of a contract); to keep the platform secure and prevent abuse (legitimate interests); to handle billing (contract); and to comply with legal obligations.",
    ],
  },
  {
    heading: "4. Processors we use",
    body: [
      "We use a minimal set of processors: Cloudflare (network delivery and protection), Stripe (payments), our inference gateway for model calls, and our own infrastructure on dedicated servers in our control. We do not sell personal data, and we do not use your workspace content to train models.",
    ],
  },
  {
    heading: "5. Retention",
    body: [
      "Workspace content is retained while your account is active. Backups are kept for 7 days. Account data is deleted within 30 days of a verified deletion request, except records we must keep for legal or security reasons.",
    ],
  },
  {
    id: "gdpr",
    heading: "6. Your rights (GDPR / EU & EEA users)",
    body: [
      "If you are in the EU or EEA you have the right to access, rectify, export, restrict, or erase your personal data, and the right to object to processing and to lodge a complaint with your supervisory authority.",
      "To exercise any right, email privacy@northlatch.com from your account address. We respond within 30 days.",
    ],
  },
  {
    heading: "7. Changes",
    body: [
      "We will announce material changes to this policy in the product and on this page at least 14 days before they take effect.",
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Effective 2026-09-30 · Northlatch Labs LLC · synappse.work
      </p>
      <div className="mt-10 space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.heading} id={section.id}>
            <h2 className="text-lg font-semibold text-foreground">
              {section.heading}
            </h2>
            {section.body.map((paragraph, index) => (
              <p
                key={index}
                className="mt-3 text-sm leading-relaxed text-muted-foreground"
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
