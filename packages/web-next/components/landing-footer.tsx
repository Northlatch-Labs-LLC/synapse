import Link from "next/link"

/**
 * Professional site footer (founder order 2026-09-30): brand line, product
 * navigation, and the full legal link set (Privacy, Terms, Cookies, GDPR).
 */

const PRODUCT_LINKS = [
  { href: "/#difference", label: "Collaboration" },
  { href: "/#capabilities", label: "Roles" },
  { href: "/#plugins", label: "Plugins" },
  { href: "/#pricing", label: "Pricing" },
]

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/privacy#gdpr", label: "GDPR" },
]

const COMPANY_LINKS = [
  { href: "/login", label: "Sign in" },
  { href: "/register", label: "Create a team" },
  { href: "mailto:ops@northlatch.com", label: "Contact" },
]

export function LandingFooter() {
  return (
    <footer className="border-t border-border/50 bg-white/70 backdrop-blur-sm">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/synapse.svg" alt="Synappse" width={24} height={24} />
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              Synappse
            </span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Turn AI into a digital team — governed teammates, shared memory,
            and auditable execution for your whole organization.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            © {new Date().getFullYear()} Northlatch Labs LLC. All rights
            reserved.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Product</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.href + link.label}>
                <Link
                  href={link.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Legal</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href + link.label}>
                <Link
                  href={link.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Account</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {COMPANY_LINKS.map((link) => (
              <li key={link.href + link.label}>
                <Link
                  href={link.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-border/50">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span>
            Synappse is a product of Northlatch Labs LLC, operated at
            synappse.work.
          </span>
          <span>
            Questions about your data?{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="mailto:privacy@northlatch.com"
            >
              privacy@northlatch.com
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
