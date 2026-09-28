import type { Metadata, Viewport } from "next"

export const metadata: Metadata = {
  title: "Turn AI into a Team",
  description:
    "Synapse mobile · One AI-team runtime for shareable coworkers, memory, authorizations, plugins, local execution, and remote agents.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f3f9ff",
  viewportFit: "cover",
}

export default function MobileLandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
