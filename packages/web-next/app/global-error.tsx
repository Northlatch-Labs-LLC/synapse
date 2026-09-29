"use client"

// Root error boundary — catches render errors in the root layout (which
// per-segment error.tsx cannot) and reports them to Sentry. Must render its own
// <html>/<body>.
import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h2>Something went wrong</h2>
          <p>Please try again, or reload the page.</p>
          <button onClick={() => reset()}>Try again</button>
        </div>
      </body>
    </html>
  )
}
