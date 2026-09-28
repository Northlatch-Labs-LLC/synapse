import Feather from "@expo/vector-icons/Feather"
import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import {
  Avatar,
  Button,
  EmptyState,
  Field,
  MobilePageHeader,
  Pill,
  ScreenScroll,
  SectionBlock,
  SectionTitleRow,
} from "@/components/ui"
import { api } from "@/lib/api"
import { getApiBaseForDisplay } from "@/lib/config"
import { useSession } from "@/providers/session-provider"
import { useWorkspace } from "@/providers/workspace-provider"
import { theme } from "@/theme/tokens"
import type { RelationshipProfileView } from "@/types/api"

export default function MeTabScreen() {
  const { user, signOut, updateProfile } = useSession()
  const {
    workspaceId,
    workspaceName,
    workspaces,
    setWorkspaceId,
    needsOnboarding,
  } = useWorkspace()
  const [name, setName] = useState(user?.name || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [friendIdProfile, setFriendIdProfile] =
    useState<RelationshipProfileView | null>(null)
  const [friendIdDraft, setFriendIdDraft] = useState("")
  const [friendIdSaving, setFriendIdSaving] = useState(false)
  const [friendIdMessage, setFriendIdMessage] = useState<string | null>(null)

  useEffect(() => {
    setName(user?.name || "")
  }, [user?.name])

  useEffect(() => {
    if (!workspaceId) {
      setFriendIdProfile(null)
      setFriendIdDraft("")
      return
    }

    let active = true
    void api
      .getMyRelationshipProfile(workspaceId)
      .then((profile) => {
        if (!active) return
        setFriendIdProfile(profile)
        setFriendIdDraft(profile.identityId)
      })
      .catch(() => {
        if (!active) return
        setFriendIdProfile(null)
      })

    return () => {
      active = false
    }
  }, [workspaceId])

  async function handleSaveProfile() {
    if (!name.trim()) {
      setError("Name cannot be empty.")
      return
    }

    setSaving(true)
    setError(null)

    try {
      await updateProfile({ name: name.trim() })
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to save profile."
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveFriendId() {
    if (!workspaceId || !friendIdProfile) return

    setFriendIdSaving(true)
    setFriendIdMessage(null)
    try {
      const nextProfile = await api.updateMyRelationshipProfile(workspaceId, {
        approvalMode: friendIdProfile.approvalMode,
        identityId: friendIdDraft,
        identitySearchEnabled: friendIdProfile.identitySearchEnabled,
      })
      setFriendIdProfile(nextProfile)
      setFriendIdDraft(nextProfile.identityId)
      setFriendIdMessage(`Friend ID updated to ${nextProfile.identityId}`)
    } catch (nextError) {
      setFriendIdMessage(
        nextError instanceof Error
          ? nextError.message
          : "Failed to save friend ID."
      )
    } finally {
      setFriendIdSaving(false)
    }
  }

  async function handleToggleFriendIdSearch() {
    if (!workspaceId || !friendIdProfile) return

    setFriendIdSaving(true)
    setFriendIdMessage(null)
    try {
      const nextProfile = await api.updateMyRelationshipProfile(workspaceId, {
        approvalMode: friendIdProfile.approvalMode,
        identityId: friendIdProfile.identityId,
        identitySearchEnabled: !friendIdProfile.identitySearchEnabled,
      })
      setFriendIdProfile(nextProfile)
      setFriendIdDraft(nextProfile.identityId)
      setFriendIdMessage(
        nextProfile.identitySearchEnabled
          ? "Search by friend ID enabled."
          : "Search by friend ID disabled."
      )
    } catch (nextError) {
      setFriendIdMessage(
        nextError instanceof Error
          ? nextError.message
          : "Failed to update the search setting."
      )
    } finally {
      setFriendIdSaving(false)
    }
  }

  return (
    <ScreenScroll bottomPadding={52} topPadding={0}>
      <MobilePageHeader title="Me" />

      <SectionBlock>
        <View style={styles.profileCard}>
          <Avatar
            name={user?.name || user?.email}
            uri={user?.avatarUrl}
            size={62}
            icon="user"
          />
          <View style={styles.profileBody}>
            <Text style={styles.profileName}>
              {user?.name || "Unnamed user"}
            </Text>
            <Text style={styles.profileEmail}>
              {user?.email || "Not signed in"}
            </Text>
          </View>
          {workspaceName ? <Pill label={workspaceName} tone="primary" /> : null}
        </View>
      </SectionBlock>

      <SectionBlock>
        <SectionTitleRow title="Profile" />
        <Field
          label="Display name"
          value={name}
          onChangeText={setName}
          placeholder="Enter the name you want to show on mobile"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={saving ? "Saving..." : "Save profile"}
          icon="save"
          onPress={() => void handleSaveProfile()}
          disabled={saving}
        />
      </SectionBlock>

      <SectionBlock>
        <SectionTitleRow title="Friend ID" />
        <Field
          label="Unique ID"
          value={friendIdDraft}
          onChangeText={setFriendIdDraft}
          placeholder="Enter your friend ID"
          autoCapitalize="none"
          autoCorrect={false}
          hint="Friend IDs are unique across the platform. Search is off by default."
        />
        {friendIdMessage ? (
          <Text style={styles.workspaceMeta}>{friendIdMessage}</Text>
        ) : null}
        <View style={styles.friendIdActions}>
          <Button
            label={friendIdSaving ? "Saving..." : "Save ID"}
            icon="save"
            variant="secondary"
            onPress={() => void handleSaveFriendId()}
            disabled={
              friendIdSaving || !friendIdProfile || !friendIdDraft.trim()
            }
            style={styles.friendIdButton}
          />
          <Button
            label={
              friendIdProfile?.identitySearchEnabled
                ? "Disable search"
                : "Enable search"
            }
            icon={friendIdProfile?.identitySearchEnabled ? "eye-off" : "eye"}
            variant="secondary"
            onPress={() => void handleToggleFriendIdSearch()}
            disabled={friendIdSaving || !friendIdProfile}
            style={styles.friendIdButton}
          />
        </View>
      </SectionBlock>

      <SectionBlock>
        <SectionTitleRow
          title="Workspace"
          action={
            !needsOnboarding ? (
              <Text style={styles.workspaceMeta}>
                {workspaces.length} workspaces
              </Text>
            ) : null
          }
        />
        {needsOnboarding ? (
          <EmptyState
            icon="briefcase"
            title="No workspaces yet"
            description="Create a workspace on the web first, then come back to continue on mobile."
          />
        ) : (
          <View style={styles.listShell}>
            {workspaces.map((workspace) => {
              const active = workspace.id === workspaceId
              return (
                <Pressable
                  key={workspace.id}
                  onPress={() => void setWorkspaceId(workspace.id)}
                  style={[
                    styles.workspaceRow,
                    active && styles.workspaceRowActive,
                  ]}
                >
                  <View style={styles.workspaceText}>
                    <Text
                      style={[
                        styles.workspaceName,
                        active && styles.workspaceNameActive,
                      ]}
                    >
                      {workspace.name}
                    </Text>
                    <Text
                      style={[
                        styles.workspaceSlug,
                        active && styles.workspaceSlugActive,
                      ]}
                    >
                      {workspace.slug}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.workspaceBadge,
                      active && styles.workspaceBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.workspaceState,
                        active && styles.workspaceStateActive,
                      ]}
                    >
                      {active ? "Current" : "Switch"}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}
      </SectionBlock>

      <SectionBlock>
        <SectionTitleRow title="Device Actions" />
        <View style={styles.listShell}>
          <ActionRow
            label="Sign out"
            icon="log-out"
            danger
            onPress={() => void signOut()}
          />
        </View>
        <Text style={styles.connectionHint}>API: {getApiBaseForDisplay()}</Text>
      </SectionBlock>
    </ScreenScroll>
  )
}

function ActionRow({
  label,
  icon,
  onPress,
  danger = false,
}: {
  label: string
  icon: keyof typeof Feather.glyphMap
  onPress: () => void
  danger?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && styles.actionRowPressed,
      ]}
    >
      <View style={styles.actionRowLead}>
        <Feather
          name={icon}
          size={18}
          color={danger ? theme.colors.danger : theme.colors.primary}
        />
        <Text style={[styles.actionLabel, danger && styles.actionLabelDanger]}>
          {label}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={theme.colors.textSoft} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  profileBody: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
  },
  profileEmail: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  error: {
    fontSize: 13,
    color: theme.colors.danger,
  },
  workspaceMeta: {
    fontSize: 12,
    color: theme.colors.textSoft,
  },
  friendIdActions: {
    flexDirection: "row",
    gap: 10,
  },
  friendIdButton: {
    flex: 1,
  },
  listShell: {
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  workspaceRow: {
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: theme.colors.surface,
  },
  workspaceRowActive: {
    backgroundColor: theme.colors.primarySoft,
  },
  workspaceText: {
    flex: 1,
    gap: 4,
  },
  workspaceName: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  workspaceNameActive: {
    color: theme.colors.text,
  },
  workspaceSlug: {
    fontSize: 12,
    color: theme.colors.textSoft,
  },
  workspaceSlugActive: {
    color: theme.colors.primary,
  },
  workspaceBadge: {
    minWidth: 48,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: "center",
  },
  workspaceBadgeActive: {
    backgroundColor: theme.colors.primary,
  },
  workspaceState: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.colors.textMuted,
  },
  workspaceStateActive: {
    color: theme.colors.white,
  },
  actionRow: {
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
  },
  actionRowPressed: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  actionRowLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
  },
  actionLabelDanger: {
    color: theme.colors.danger,
  },
  connectionHint: {
    fontSize: 12,
    color: theme.colors.textSoft,
  },
})
