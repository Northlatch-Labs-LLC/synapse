"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { resolveDestination } from "@/lib/post-login"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * WhatsApp OTP sign-in (west-first default, founder order 2026-09-29).
 * Phone number → 6-digit code over WhatsApp → session. Used by the login and
 * signup forms; email stays as the secondary option below it.
 */
export function WhatsAppSignInPanel({
  actionLabel,
  redirect,
  disabled,
  onError,
}: {
  actionLabel: "Sign in" | "Sign up"
  redirect: string | null
  disabled?: boolean
  onError: (message: string) => void
}) {
  const router = useRouter()
  const [stage, setStage] = useState<"phone" | "code">("phone")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)

  async function requestOtp() {
    setBusy(true)
    onError("")
    try {
      const res = await fetch("/api/v1/auth/phone-number/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim() }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string
        }
        onError(
          body.message ||
            "Could not send the WhatsApp code. Check the number (country code included, e.g. +15551234567)."
        )
        return
      }
      setStage("code")
    } catch {
      onError("Network error — please try again.")
    } finally {
      setBusy(false)
    }
  }

  async function verifyOtp() {
    setBusy(true)
    onError("")
    try {
      const res = await fetch("/api/v1/auth/phone-number/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
          code: code.trim(),
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string
        }
        onError(
          body.message ||
            "That code did not match. Request a new one if it expired."
        )
        return
      }
      router.push(await resolveDestination(redirect))
      router.refresh()
    } catch {
      onError("Network error — please try again.")
    } finally {
      setBusy(false)
    }
  }

  if (stage === "code") {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="whatsapp-otp">Code from WhatsApp</Label>
          <Input
            id="whatsapp-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy || disabled}
          />
          <p className="text-xs text-muted-foreground">
            Sent to {phoneNumber} via WhatsApp.
          </p>
        </div>
        <Button
          type="button"
          className="w-full"
          onClick={verifyOtp}
          disabled={busy || disabled || code.trim().length < 4}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Verify and {actionLabel === "Sign in" ? "sign in" : "create account"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => {
            setStage("phone")
            setCode("")
          }}
          disabled={busy || disabled}
        >
          Use a different number
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="whatsapp-phone">Phone number (WhatsApp)</Label>
        <Input
          id="whatsapp-phone"
          type="tel"
          autoComplete="tel"
          placeholder="+15551234567"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          disabled={busy || disabled}
        />
      </div>
      <Button
        type="button"
        className="w-full"
        onClick={requestOtp}
        disabled={busy || disabled || phoneNumber.trim().length < 8}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Continue with WhatsApp
      </Button>
    </div>
  )
}
