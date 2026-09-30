import Feather from "@expo/vector-icons/Feather"
import { useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { StyleSheet, Text, View } from "react-native"

import {
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  ScreenScroll,
  SectionHeader,
} from "@/components/ui"
import { getAuthClient } from "@/lib/auth-client"
import { getAuthErrorMessage } from "@/lib/auth-errors"
import { assertAuthConfigured } from "@/lib/config"
import { useSession } from "@/providers/session-provider"
import { theme } from "@/theme/tokens"

function getErrorMessage(error: unknown) {
  return getAuthErrorMessage(error, "Could not read the QR sign-in request.")
}

type DeviceStatus = "claiming" | "pending" | "approved" | "denied" | "error"

export default function QrLoginScreen() {
  // The QR encodes Better Auth's verification_uri_complete; the scanner passes
  // the extracted user_code (legacy `token` param name kept for compatibility).
  const params = useLocalSearchParams<{ user_code?: string; token?: string }>()
  const userCode = params.user_code ?? params.token
  const { user } = useSession()
  const [status, setStatus] = useState<DeviceStatus>("claiming")
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<"approve" | "deny" | null>(null)

  useEffect(() => {
    if (!userCode) {
      setError("Missing device sign-in code.")
      setStatus("error")
      return
    }
    let cancelled = false

    // GET /device claims the pending code for THIS (authenticated) session so a
    // subsequent approve is bound to the right user.
    async function claim() {
      try {
        assertAuthConfigured()
        const { error: claimError } = await getAuthClient().device({
          query: { user_code: userCode as string },
        })
        if (cancelled) return
        if (claimError) {
          setError(getErrorMessage(claimError))
          setStatus("error")
          return
        }
        setStatus("pending")
      } catch (nextError) {
        if (!cancelled) {
          setError(getErrorMessage(nextError))
          setStatus("error")
        }
      }
    }

    void claim()
    return () => {
      cancelled = true
    }
  }, [userCode])

  async function handleApprove() {
    if (!userCode) return
    setAction("approve")
    setError(null)
    try {
      assertAuthConfigured()
      const { error: approveError } = await getAuthClient().device.approve({
        userCode,
      })
      if (approveError) {
        setError(getErrorMessage(approveError))
      } else {
        setStatus("approved")
      }
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    } finally {
      setAction(null)
    }
  }

  async function handleReject() {
    if (!userCode) return
    setAction("deny")
    setError(null)
    try {
      assertAuthConfigured()
      const { error: denyError } = await getAuthClient().device.deny({
        userCode,
      })
      if (denyError) {
        setError(getErrorMessage(denyError))
      } else {
        setStatus("denied")
      }
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    } finally {
      setAction(null)
    }
  }

  return (
    <ScreenScroll bottomPadding={32}>
      <SectionHeader
        eyebrow="Verification"
        title="Confirm web sign-in"
        subtitle="Confirm this desktop sign-in request was started by you. Check that the code matches what is shown on your computer screen."
      />

      {status === "claiming" ? (
        <Card>
          <LoadingBlock label="Reading the sign-in request..." />
        </Card>
      ) : status === "error" ? (
        <EmptyState
          icon="shield-off"
          title="Can't confirm this sign-in"
          description={
            error || "The device sign-in request does not exist or has expired."
          }
        />
      ) : (
        <Card style={styles.confirmCard}>
          <View style={styles.headline}>
            <View style={styles.headlineIcon}>
              <Feather
                name={
                  status === "approved"
                    ? "check-circle"
                    : status === "denied"
                      ? "x-circle"
                      : "monitor"
                }
                size={22}
                color={theme.colors.primary}
              />
            </View>
            <View style={styles.headlineText}>
              <Text style={styles.title}>
                {status === "pending"
                  ? "Your desktop is waiting for your confirmation"
                  : status === "approved"
                    ? "This web sign-in is approved"
                    : "This web sign-in was denied"}
              </Text>
              <Text style={styles.subtitle}>
                {status === "pending"
                  ? "Check that the code below matches the one on your computer before approving."
                  : "If this was you, you can return to your computer to continue."}
              </Text>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <MetaRow label="Code" value={userCode ?? "-"} />
            <MetaRow
              label="Account"
              value={user?.name || user?.email || "Current account"}
            />
            <MetaRow
              label="Status"
              value={
                status === "pending"
                  ? "Pending"
                  : status === "approved"
                    ? "Approved"
                    : "Denied"
              }
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {status === "pending" ? (
            <View style={styles.actions}>
              <Button
                label={
                  action === "approve" ? "Approving..." : "Approve sign-in"
                }
                icon="shield"
                onPress={() => void handleApprove()}
                disabled={action !== null}
              />
              <Button
                label={action === "deny" ? "Denying..." : "Deny this sign-in"}
                variant="ghost"
                icon="x"
                onPress={() => void handleReject()}
                disabled={action !== null}
              />
            </View>
          ) : null}
        </Card>
      )}
    </ScreenScroll>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  confirmCard: {
    gap: 18,
  },
  headline: {
    flexDirection: "row",
    gap: 14,
  },
  headlineIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headlineText: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textMuted,
  },
  metaGrid: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: "hidden",
  },
  metaRow: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  metaLabel: {
    fontSize: 13,
    color: theme.colors.textSoft,
  },
  metaValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: "600",
  },
  actions: {
    gap: 10,
  },
  error: {
    fontSize: 13,
    color: theme.colors.danger,
  },
})
