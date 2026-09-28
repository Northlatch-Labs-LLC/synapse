import { useLocalSearchParams, useRouter } from "expo-router"
import { startTransition, useEffect, useMemo, useState } from "react"
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { ConversationList } from "@/components/conversation-list"
import { HomeQuickComposer } from "@/components/home-quick-composer"
import { MobileHeaderActions } from "@/components/mobile-header-actions"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import {
  EmptyState,
  LoadingBlock,
  MobilePageHeader,
  ScreenView,
  SectionBlock,
  SectionTitleRow,
} from "@/components/ui"
import { useScanLauncher } from "@/hooks/use-scan-launcher"
import { api } from "@/lib/api"
import { useChat } from "@/providers/chat-provider"
import { useWorkspace } from "@/providers/workspace-provider"
import { theme } from "@/theme/tokens"
import { textBlock, type Actor } from "@shared"

export default function HomeTabScreen() {
  const router = useRouter()
  const { openScan, permissionSheet } = useScanLauncher("relationship")
  const params = useLocalSearchParams<{ actorId?: string }>()
  const {
    workspaceId,
    workspaceName,
    workspaces,
    needsOnboarding,
    setWorkspaceId,
  } = useWorkspace()
  const {
    clientInstanceId,
    conversations,
    createConversation,
    refreshInbox,
    sendMessage,
    status,
    workspaceMemberId,
  } = useChat()
  const [actors, setActors] = useState<Actor[]>([])
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedActor = useMemo(
    () =>
      actors.find((actor) => actor.id === selectedActorId) ?? actors[0] ?? null,
    [actors, selectedActorId]
  )

  async function loadData(isRefreshing = false) {
    if (!workspaceId) {
      setActors([])
      setSelectedActorId(null)
      setLoading(false)
      setRefreshing(false)
      return
    }

    if (isRefreshing) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const [actors, preferenceResponse] = await Promise.all([
        api.getActors(workspaceId),
        api.getWorkspaceChiefActorPreference(workspaceId).catch(() => null),
      ])

      const activeActors = actors.filter((actor) => actor.isActive)

      setActors(activeActors)
      setSelectedActorId(
        params.actorId ||
          preferenceResponse?.chiefActorId ||
          activeActors[0]?.id ||
          null
      )
      setError(null)
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Failed to load Home."
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [params.actorId, workspaceId])

  useEffect(() => {
    if (!params.actorId) return
    if (!actors.some((actor) => actor.id === params.actorId)) return
    setSelectedActorId(params.actorId)
  }, [actors, params.actorId])

  async function handleStartConversation(content: string) {
    const trimmed = content.trim()
    if (!workspaceId || !selectedActor || !trimmed) return
    if (status !== "ready" || !clientInstanceId) {
      setError("Chat connection is not ready yet. Please try again shortly.")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await createConversation({
        kind: "group",
        actorIds: [selectedActor.id],
        title: selectedActor.definition.displayName,
      })
      const conversationId = response.conversation.conversationId

      if (conversationId) {
        await sendMessage(conversationId, {
          contentBlocks: [textBlock(trimmed)],
        })
        startTransition(() => {
          router.push(`/chat/${conversationId}`)
        })
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to create chat."
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!workspaceId && needsOnboarding) {
    return (
      <ScreenView>
        <View style={styles.stateWrap}>
          <LoadingBlock label="Entering workspace setup..." />
        </View>
      </ScreenView>
    )
  }

  return (
    <ScreenView>
      <View style={styles.pageShell}>
        <View style={styles.headerGutter}>
          <MobilePageHeader
            titleNode={
              <WorkspaceSwitcher
                workspaceName={workspaceName}
                activeWorkspaceId={workspaceId}
                workspaces={workspaces}
                onSelectWorkspace={setWorkspaceId}
                onCreateWorkspace={() => router.push("/workspace/create")}
              />
            }
            action={
              <MobileHeaderActions
                onSearch={() => router.push("/search")}
                onStartGroup={() => router.push("/contacts/group/new")}
                onAddFriend={() => router.push("/contacts/add")}
                onScan={() => void openScan()}
              />
            }
          />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void Promise.all([loadData(true), refreshInbox()])
              }}
            />
          }
        >
          {loading ? (
            <SectionBlock>
              <LoadingBlock label="Loading Home..." />
            </SectionBlock>
          ) : (
            <>
              <SectionBlock style={styles.quickComposerBlock}>
                <SectionTitleRow title="Quick Start" />
                <HomeQuickComposer
                  actor={selectedActor}
                  sending={submitting}
                  disabled={
                    actors.length === 0 ||
                    status !== "ready" ||
                    !clientInstanceId
                  }
                  onPressSelectActor={() => router.push("/actors/select")}
                  onSend={handleStartConversation}
                />
                {actors.length === 0 ? (
                  <Text style={styles.emptyHint}>
                    No actors available in this workspace yet.
                  </Text>
                ) : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
              </SectionBlock>

              <SectionBlock>
                <SectionTitleRow
                  title="Recent Chats"
                  action={
                    <Pressable onPress={() => router.replace("/chats")}>
                      <Text style={styles.linkText}>View all</Text>
                    </Pressable>
                  }
                />
                {conversations.length > 0 ? (
                  <ConversationList
                    conversations={conversations}
                    workspaceMemberId={workspaceMemberId}
                    maxItems={3}
                    showDividers={false}
                    onPressConversation={(conversation) =>
                      router.push(`/chat/${conversation.conversationId}`)
                    }
                  />
                ) : (
                  <EmptyState
                    icon="message-square"
                    title="No chats yet"
                    description="Send your first message using the composer above."
                  />
                )}
              </SectionBlock>
            </>
          )}
        </ScrollView>
      </View>
      {permissionSheet}
    </ScreenView>
  )
}

const styles = StyleSheet.create({
  pageShell: {
    flex: 1,
  },
  headerGutter: {
    paddingHorizontal: 18,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 128,
  },
  stateWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  quickComposerBlock: {
    borderTopWidth: 0,
    borderBottomWidth: 0,
  },
  emptyHint: {
    fontSize: 13,
    color: theme.colors.textSoft,
  },
  error: {
    fontSize: 13,
    color: theme.colors.danger,
  },
  linkText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
  },
})
