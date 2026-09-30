import Feather from "@expo/vector-icons/Feather"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { CONTACT_TARGET_TYPE } from "@shared"
import { Pressable, StyleSheet, Text, View } from "react-native"

import {
  Avatar,
  Button,
  EmptyState,
  LoadingBlock,
  Pill,
  ScreenScroll,
  SectionBlock,
  SectionTitleRow,
} from "@/components/ui"
import { api } from "@/lib/api"
import { useWorkspace } from "@/providers/workspace-provider"
import { theme } from "@/theme/tokens"
import type {
  ActorAccessRequestListResponse,
  FriendRequestListResponse,
} from "@/types/api"

export default function ContactRequestsScreen() {
  const router = useRouter()
  const { workspaceId } = useWorkspace()
  const [friendRequests, setFriendRequests] =
    useState<FriendRequestListResponse | null>(null)
  const [actorAccessRequests, setActorAccessRequests] =
    useState<ActorAccessRequestListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadRequests() {
    if (!workspaceId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [friends, actorAccess] = await Promise.all([
        api.getFriendRequests(workspaceId),
        api.getActorAccessRequests(workspaceId),
      ])
      setFriendRequests(friends)
      setActorAccessRequests(actorAccess)
      setError(null)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to load requests."
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRequests()
  }, [workspaceId])

  async function handleResolveFriend(
    requestId: string,
    decision: "approve" | "reject"
  ) {
    if (!workspaceId || submittingId) return
    setSubmittingId(requestId)
    try {
      if (decision === "approve") {
        await api.approveFriendRequest(workspaceId, requestId)
      } else {
        await api.rejectFriendRequest(workspaceId, requestId)
      }
      await loadRequests()
    } finally {
      setSubmittingId(null)
    }
  }

  async function handleResolveActorAccess(
    requestId: string,
    decision: "approve" | "reject"
  ) {
    if (!workspaceId || submittingId) return
    setSubmittingId(requestId)
    try {
      if (decision === "approve") {
        await api.approveActorAccessRequest(workspaceId, requestId)
      } else {
        await api.rejectActorAccessRequest(workspaceId, requestId)
      }
      await loadRequests()
    } finally {
      setSubmittingId(null)
    }
  }

  const friendIncoming = friendRequests?.incoming || []
  const friendOutgoing = friendRequests?.outgoing || []
  const actorIncoming = actorAccessRequests?.incoming || []
  const actorOutgoing = actorAccessRequests?.outgoing || []

  return (
    <ScreenScroll topPadding={0} bottomPadding={56}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <Feather name="chevron-left" size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Requests</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <SectionBlock>
          <LoadingBlock label="Loading requests..." />
        </SectionBlock>
      ) : error ? (
        <SectionBlock>
          <EmptyState
            icon="alert-circle"
            title="Failed to load requests"
            description={error}
          />
        </SectionBlock>
      ) : (
        <>
          <SectionBlock>
            <SectionTitleRow
              title="Pending friend requests"
              action={
                <Text style={styles.countText}>{friendIncoming.length}</Text>
              }
            />
            {friendIncoming.length > 0 ? (
              <View style={styles.listShell}>
                {friendIncoming.map((request) => (
                  <View key={request.id} style={styles.rowCard}>
                    <Avatar
                      name={request.requester?.name || "User"}
                      icon={
                        request.targetType === CONTACT_TARGET_TYPE.ACTOR
                          ? "cpu"
                          : "user"
                      }
                    />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>
                        {request.requester?.name || "Unnamed user"}
                      </Text>
                      <Text style={styles.rowSubtitle}>
                        {request.targetType === CONTACT_TARGET_TYPE.ACTOR
                          ? `Wants to add actor: ${request.targetActor?.displayName || "Unknown actor"}`
                          : `Friend request · ${request.requester?.workspace.name || ""}`}
                      </Text>
                    </View>
                    <View style={styles.actionColumn}>
                      <Button
                        label={
                          submittingId === request.id ? "Working" : "Approve"
                        }
                        disabled={submittingId === request.id}
                        onPress={() =>
                          void handleResolveFriend(request.id, "approve")
                        }
                      />
                      <Button
                        label="Reject"
                        variant="ghost"
                        disabled={submittingId === request.id}
                        onPress={() =>
                          void handleResolveFriend(request.id, "reject")
                        }
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState
                icon="inbox"
                title="No pending friend requests"
                description="New friend requests will appear here."
              />
            )}
          </SectionBlock>

          <SectionBlock>
            <SectionTitleRow
              title="Pending actor access requests"
              action={
                <Text style={styles.countText}>{actorIncoming.length}</Text>
              }
            />
            {actorIncoming.length > 0 ? (
              <View style={styles.listShell}>
                {actorIncoming.map((request) => (
                  <View key={request.id} style={styles.rowCard}>
                    <Avatar
                      name={request.actor?.displayName || "Actor"}
                      icon="cpu"
                    />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>
                        {request.actor?.displayName || "Unknown actor"}
                      </Text>
                      <Text style={styles.rowSubtitle}>
                        {`${
                          request.requester?.name || "Someone"
                        } wants to start a chat`}
                      </Text>
                    </View>
                    <View style={styles.actionColumn}>
                      <Button
                        label={
                          submittingId === request.id ? "Working" : "Approve"
                        }
                        disabled={submittingId === request.id}
                        onPress={() =>
                          void handleResolveActorAccess(request.id, "approve")
                        }
                      />
                      <Button
                        label="Reject"
                        variant="ghost"
                        disabled={submittingId === request.id}
                        onPress={() =>
                          void handleResolveActorAccess(request.id, "reject")
                        }
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState
                icon="cpu"
                title="No pending actor access requests"
                description="Requests appear here when an actor needs manual approval."
              />
            )}
          </SectionBlock>

          <SectionBlock>
            <SectionTitleRow
              title="Sent requests"
              action={
                <Text style={styles.countText}>
                  {friendOutgoing.length + actorOutgoing.length}
                </Text>
              }
            />
            {friendOutgoing.length + actorOutgoing.length > 0 ? (
              <View style={styles.outgoingShell}>
                {friendOutgoing.map((request) => (
                  <View key={request.id} style={styles.outgoingRow}>
                    <Text style={styles.rowTitle}>
                      {request.targetType === CONTACT_TARGET_TYPE.ACTOR
                        ? request.targetActor?.displayName || "Unknown actor"
                        : request.targetMember?.name ||
                          request.targetMember?.email ||
                          "Unknown member"}
                    </Text>
                    <Pill label="Friend request pending" tone="accent" />
                  </View>
                ))}
                {actorOutgoing.map((request) => (
                  <View key={request.id} style={styles.outgoingRow}>
                    <Text style={styles.rowTitle}>
                      {request.actor?.displayName || "Unknown actor"}
                    </Text>
                    <Pill label="Access request pending" tone="accent" />
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState
                icon="clock"
                title="No requests awaiting a reply"
                description="Friend or actor access requests you send will show up here."
              />
            )}
          </SectionBlock>
        </>
      )}
    </ScreenScroll>
  )
}

const styles = StyleSheet.create({
  header: {
    marginHorizontal: -18,
    paddingHorizontal: 18,
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
  },
  headerSpacer: {
    width: 38,
  },
  countText: {
    fontSize: 12,
    color: theme.colors.textSoft,
  },
  listShell: {
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowCard: {
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  rowSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
  actionColumn: {
    gap: 8,
    alignItems: "flex-end",
  },
  outgoingShell: {
    gap: 10,
  },
  outgoingRow: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
})
