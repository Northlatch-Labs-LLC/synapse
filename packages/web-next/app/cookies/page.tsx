import type { Metadata } from "next"

export const metadata: Metadata = { title: "Cookie Policy" }

export default function CookiesPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Cookie Policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Effective 2026-09-30 · Northlatch Labs LLC · synappse.work
      </p>
      <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">What we use</h2>
          <p className="mt-2">
            Synappse uses a minimal set of cookies and local storage entries,
            all strictly necessary to run the product. We do not use
            advertising, analytics, or third-party tracking cookies.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">The cookies</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Session cookie</strong> — set
              when you sign in so the app can keep you authenticated. It is
              essential and expires with your session (30 days maximum).
            </li>
            <li>
              <strong className="text-foreground">Theme preference</strong> — a
              local storage entry remembering your light/dark choice. Not a
              cookie and never sent to our servers.
            </li>
            <li>
              <strong className="text-foreground">Cloudflare cookies</strong> —
              set by our network provider for security and bot protection (e.g.
              cf_clearance when a challenge is issued).
            </li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            Your choices
          </h2>
          <p className="mt-2">
            You can clear or block cookies in your browser settings. Blocking
            the session cookie will sign you out and prevent sign-in, since it
            is essential to the operation of the product.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">Questions</h2>
          <p className="mt-2">privacy@northlatch.com</p>
        </section>
      </div>
    </div>
  )
}
