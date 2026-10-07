"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { z } from "zod"
import { Loader2 } from "lucide-react"

import { api, ApiError } from "@/lib/api"
import { getAuthErrorMessage } from "@/lib/auth-errors"
import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { EmailInput } from "@/components/ui/email-input"
import { PasswordInput } from "@/components/ui/password-input"

const requestSchema = z.object({
  email: z.email("Enter a valid email address"),
})

type RequestValues = z.infer<typeof requestSchema>

const resetSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string().min(1, "Confirm your new password"),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  })

type ResetValues = z.infer<typeof resetSchema>

/**
 * Password reset surface, two modes in one route:
 *  - no `?token=`  → request a reset email (Better Auth POST /auth/request-password-reset)
 *  - `?token=<t>`  → choose a new password (Better Auth POST /auth/reset-password)
 * The reset email links here with the token (built by the api's
 * emailAndPassword.sendResetPassword via buildPasswordResetUrl).
 */
function ResetPasswordInner() {
  const token = useSearchParams().get("token")
  return token ? <ResetForm token={token} /> : <RequestForm />
}

function RequestForm() {
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestValues>({
    resolver: standardSchemaResolver(requestSchema),
    defaultValues: { email: "" },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError("")
    try {
      // The endpoint answers the same neutral success whether or not the
      // address exists (anti-enumeration), so success copy stays conditional.
      await api.requestPasswordReset(values.email)
      setSubmitted(true)
    } catch (err) {
      // Deployment misconfiguration (api early-guard 503): without outbound
      // email no link can ever arrive, so "check your inbox" would strand the
      // user — say so instead of pretending the email is on its way.
      if (err instanceof ApiError && err.code === "EMAIL_NOT_CONFIGURED") {
        setSubmitError(
          "Email delivery isn't set up on this server, so a reset link can't be sent. Please contact support."
        )
        return
      }
      setSubmitError(getAuthErrorMessage(err, "Reset"))
    }
  })

  if (submitted) {
    return (
      <ResetCard
        title="Check your email"
        description="If an account exists for that address, we sent a link to reset your password. It expires in 60 minutes."
      >
        <FieldDescription className="text-center">
          <Link href="/login" className="underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </FieldDescription>
      </ResetCard>
    )
  }

  return (
    <ResetCard
      title="Forgot your password?"
      description="Enter your account email and we'll send you a link to reset your password."
    >
      <form method="post" onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.email) || undefined}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Controller
              control={control}
              name="email"
              render={({ field }) => (
                <EmailInput
                  {...field}
                  id="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  aria-invalid={Boolean(errors.email) || undefined}
                />
              )}
            />
            <FieldError
              errors={
                errors.email
                  ? [{ message: errors.email.message }]
                  : submitError
                    ? [{ message: submitError }]
                    : undefined
              }
            />
          </Field>
          <Field>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Sending reset link
                </>
              ) : (
                "Send reset link"
              )}
            </Button>
          </Field>
          <FieldDescription className="text-center">
            Remembered it?{" "}
            <Link href="/login" className="underline-offset-2 hover:underline">
              Back to sign in
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>
    </ResetCard>
  )
}

function ResetForm({ token }: { token: string }) {
  const [submitted, setSubmitted] = useState(false)
  const [expired, setExpired] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: standardSchemaResolver(resetSchema),
    defaultValues: { password: "", confirm: "" },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError("")
    try {
      await api.resetPassword(token, values.password)
      setSubmitted(true)
    } catch (err) {
      // An invalid/expired token is not a "try again" — route the user to a
      // fresh reset link instead of a retry loop. Better Auth 1.7.6 answers a
      // bad token with 400 and an empty body (BASE_ERROR_CODES values are
      // message strings, so no code survives the wire); the client-side
      // minimum-length check already covers the password-validation 400s.
      if (
        err instanceof ApiError &&
        (err.code === "INVALID_TOKEN" || err.status === 400)
      ) {
        setExpired(true)
        return
      }
      setSubmitError(getAuthErrorMessage(err, "Reset"))
    }
  })

  if (submitted) {
    return (
      <ResetCard
        title="Password updated"
        description="Your password has been changed. Sign in with the new password."
      >
        <FieldDescription className="text-center">
          <Link href="/login" className="underline-offset-2 hover:underline">
            Sign in
          </Link>
        </FieldDescription>
      </ResetCard>
    )
  }

  if (expired) {
    return (
      <ResetCard
        title="Link expired"
        description="This reset link is invalid or has expired. Request a new one to continue."
      >
        <FieldDescription className="text-center">
          <Link
            href="/auth/reset-password"
            className="underline-offset-2 hover:underline"
          >
            Request a new link
          </Link>
        </FieldDescription>
      </ResetCard>
    )
  }

  return (
    <ResetCard
      title="Reset your password"
      description="Choose a new password for your account."
    >
      <form method="post" onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.password) || undefined}>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Controller
              control={control}
              name="password"
              render={({ field }) => (
                <PasswordInput
                  {...field}
                  id="password"
                  autoComplete="new-password"
                  autoFocus
                  aria-invalid={Boolean(errors.password) || undefined}
                />
              )}
            />
            <FieldError
              errors={
                errors.password
                  ? [{ message: errors.password.message }]
                  : undefined
              }
            />
          </Field>
          <Field data-invalid={Boolean(errors.confirm) || undefined}>
            <FieldLabel htmlFor="confirm">Confirm new password</FieldLabel>
            <Controller
              control={control}
              name="confirm"
              render={({ field }) => (
                <PasswordInput
                  {...field}
                  id="confirm"
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.confirm) || undefined}
                />
              )}
            />
            <FieldError
              errors={
                errors.confirm
                  ? [{ message: errors.confirm.message }]
                  : submitError
                    ? [{ message: submitError }]
                    : undefined
              }
            />
          </Field>
          <Field>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Updating password
                </>
              ) : (
                "Update password"
              )}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </ResetCard>
  )
}

function ResetCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <AuthShell>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </AuthShell>
  )
}

function LoadingScreen() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-6 text-sm text-muted-foreground">
      Loading…
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
        <div className="w-full max-w-sm">
          <ResetPasswordInner />
        </div>
      </div>
    </Suspense>
  )
}
