import { CameraView, useCameraPermissions } from "expo-camera"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import {
  RELATIONSHIP_SCAN_OUTCOME,
  parseSynapseQrPayload,
  type ParsedSynapseQrPayload,
} from "@shared"
import { Pressable, StyleSheet, Text, View } from "react-native"

import {
  Button,
  Card,
  EmptyState,
  ScreenScroll,
  SectionHeader,
} from "@/components/ui"
import { api, ApiError } from "@/lib/api"
import { useWorkspace } from "@/providers/workspace-provider"
import { theme } from "@/theme/tokens"
import type { RelationshipScanResponse } from "@/types/api"

function getRelationshipHint(result: RelationshipScanResponse) {
  switch (result.outcome) {
    case RELATIONSHIP_SCAN_OUTCOME.FRIEND_REQUEST_CREATED:
      return "Friend request sent. Waiting for them to respond."
    case RELATIONSHIP_SCAN_OUTCOME.FRIEND_REQUEST_PENDING:
      return "You already sent a friend request. Waiting for them to respond."
    case RELATIONSHIP_SCAN_OUTCOME.ACTOR_ACCESS_REQUEST_CREATED:
      return "Actor access request submitted. Waiting for approval."
    case RELATIONSHIP_SCAN_OUTCOME.ACTOR_ACCESS_PENDING:
    case RELATIONSHIP_SCAN_OUTCOME.REMOTE_AGENT_ACCESS_PENDING:
      return "You have already submitted an Actor access request."
    case RELATIONSHIP_SCAN_OUTCOME.REMOTE_AGENT_ACCESS_REQUEST_CREATED:
      return "Remote agent access request submitted. Waiting for approval."
    default:
      return "QR code recognized, but there is no conversation to open right now."
  }
}

export default function UnifiedScanScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    kind?: string
    token?: string
    intent?: string
  }>()
  const { workspaceId, workspaceName } = useWorkspace()
  const [permission, requestPermission] = useCameraPermissions()
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  async function handleRelationshipResult(result: RelationshipScanResponse) {
    if (
      workspaceId &&
      result.contact &&
      (result.outcome === RELATIONSHIP_SCAN_OUTCOME.SAME_WORKSPACE_MEMBER ||
        result.outcome === RELATIONSHIP_SCAN_OUTCOME.FRIEND_ACTIVE ||
        result.outcome === RELATIONSHIP_SCAN_OUTCOME.ACTOR_ACCESS_GRANTED ||
        result.outcome ===
          RELATIONSHIP_SCAN_OUTCOME.REMOTE_AGENT_ACCESS_GRANTED)
    ) {
      const opened = await api.openDirectConversation(workspaceId, {
        contactKind: result.contact.kind,
        contactId: result.contact.id,
      })
      if (opened.conversationId) {
        router.replace(`/chat/${opened.conversationId}`)
        return
      }
    }

    if (result.outcome === RELATIONSHIP_SCAN_OUTCOME.SELF_SCAN) {
      setError("You can't scan your own QR code.")
      return
    }

    setHint(getRelationshipHint(result))
  }

  async function handleRelationshipToken(token: string) {
    if (!workspaceId) {
      throw new Error(
        "No workspace available, so the contact QR code can't be processed."
      )
    }
    const result = await api.scanRelationshipQr(workspaceId, token)
    await handleRelationshipResult(result)
  }

  async function routeLoginUserCode(userCode: string) {
    router.replace(`/qr-login?user_code=${encodeURIComponent(userCode)}`)
  }

  async function processParsedPayload(parsed: ParsedSynapseQrPayload) {
    setLocked(true)
    setError(null)
    setHint(null)

    try {
      if (parsed.kind === "relationship") {
        await handleRelationshipToken(parsed.token)
        return
      }

      // Other kinds (legacy login token / generic) are treated as relationship
      // tokens; device-login QR codes carry a user_code URL and are handled in
      // handleScan before reaching here.
      await handleRelationshipToken(parsed.token)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Scan failed. Please try again later."
      )
    } finally {
      setLocked(false)
    }
  }

  /**
   * Better Auth deviceAuthorization QR codes encode a verification_uri_complete
   * URL carrying a `user_code` query param. Detect that and return the code.
   */
  function extractDeviceUserCode(data: string): string | null {
    try {
      const url = new URL(data)
      return url.searchParams.get("user_code")
    } catch {
      return null
    }
  }

  function handleScan(payload: { data: string }) {
    if (locked) return

    const deviceUserCode = extractDeviceUserCode(payload.data)
    if (deviceUserCode) {
      void routeLoginUserCode(deviceUserCode)
      return
    }

    const parsed = parseSynapseQrPayload(payload.data)
    if (!parsed) {
      setError("This QR code is not a Synappse sign-in or contact code.")
      return
    }

    void processParsedPayload(parsed)
  }

  useEffect(() => {
    const token = typeof params.token === "string" ? params.token.trim() : ""
    const kind =
      typeof params.kind === "string" ? params.kind.trim().toLowerCase() : ""
    if (!token || locked) return
    if (kind !== "relationship") return

    void processParsedPayload({
      kind: "relationship",
      token,
    })
  }, [locked, params.kind, params.token, workspaceId])

  const hasPermission = permission?.granted
  const intent =
    typeof params.intent === "string" ? params.intent.trim().toLowerCase() : ""

  return (
    <ScreenScroll bottomPadding={32}>
      <SectionHeader
        eyebrow="Unified Scan"
        title="Scan"
        subtitle={
          intent === "login"
            ? "One scanner for both web sign-in and contact QR codes. A sign-in request goes straight to confirmation."
            : intent === "relationship"
              ? "One scanner for both contact and web sign-in QR codes. A contact code is handled automatically for the current workspace."
              : `One scanner for web sign-in and adding contacts. Current workspace: ${workspaceName || "None"}.`
        }
      />

      {!hasPermission ? (
        <EmptyState
          icon="camera"
          title="Camera permission needed"
          description="Allow camera access to scan Synappse sign-in or contact QR codes."
          action={
            <View style={styles.permissionAction}>
              <Button
                label="Grant camera access"
                icon="camera"
                onPress={() => void requestPermission()}
              />
            </View>
          }
        />
      ) : (
        <Card style={styles.cameraCard}>
          <View style={styles.cameraFrame}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              onBarcodeScanned={locked ? undefined : handleScan}
            />
            <View style={styles.frameOverlay}>
              <View style={styles.focusSquare} />
            </View>
          </View>
          <Text style={styles.cameraHint}>
            A web sign-in request opens the confirmation page; a contact QR code
            opens the chat or sends a request automatically.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                setError(null)
                setHint(null)
              }}
              style={styles.retryLink}
            >
              <Text style={styles.retryLinkText}>Keep scanning</Text>
            </Pressable>
            <Button
              label="View requests"
              icon="inbox"
              variant="secondary"
              onPress={() => router.push("/contacts/requests")}
            />
          </View>
        </Card>
      )}
    </ScreenScroll>
  )
}

const styles = StyleSheet.create({
  permissionAction: {
    marginTop: 8,
    width: "100%",
  },
  cameraCard: {
    padding: 14,
  },
  cameraFrame: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: theme.colors.black,
  },
  frameOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  focusSquare: {
    width: "72%",
    aspectRatio: 1,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
  },
  cameraHint: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textMuted,
  },
  error: {
    color: theme.colors.danger,
    fontSize: 13,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  retryLink: {
    alignSelf: "flex-start",
  },
  retryLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
  },
})
