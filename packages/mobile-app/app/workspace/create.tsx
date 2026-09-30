import Feather from "@expo/vector-icons/Feather"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import {
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { Button, Field, ScreenScroll, SectionBlock } from "@/components/ui"
import { api } from "@/lib/api"
import { useSession } from "@/providers/session-provider"
import { useWorkspace } from "@/providers/workspace-provider"
import { theme } from "@/theme/tokens"

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Failed to create the workspace."
}

export default function CreateWorkspaceScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ required?: string }>()
  const { signOut } = useSession()
  const { needsOnboarding, refreshWorkspaces, workspaces } = useWorkspace()
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requiresWorkspaceCreation = useMemo(
    () =>
      params.required === "1" || (needsOnboarding && workspaces.length === 0),
    [needsOnboarding, params.required, workspaces.length]
  )

  async function leaveToLogin() {
    await signOut()
    router.replace("/login")
  }

  function confirmLeaveWithoutWorkspace() {
    Alert.alert(
      "Create a workspace first",
      "You need a workspace to continue. Going back will sign you out and return you to the sign-in page.",
      [
        {
          text: "Keep creating",
          style: "cancel",
        },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            void leaveToLogin()
          },
        },
      ]
    )
  }

  function handleBackPress() {
    if (requiresWorkspaceCreation) {
      confirmLeaveWithoutWorkspace()
      return
    }

    router.back()
  }

  useEffect(() => {
    if (!requiresWorkspaceCreation) {
      return
    }

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        confirmLeaveWithoutWorkspace()
        return true
      }
    )

    return () => subscription.remove()
  }, [requiresWorkspaceCreation])

  async function handleCreateWorkspace() {
    const nextName = name.trim()
    if (!nextName) {
      setError("Please enter a workspace name.")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const workspace = await api.createWorkspace(nextName)
      await refreshWorkspaces(workspace.id)
      router.replace("/")
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ScreenScroll topPadding={0} bottomPadding={56}>
      <Stack.Screen
        options={{
          gestureEnabled: !requiresWorkspaceCreation,
        }}
      />

      <View style={styles.header}>
        <Pressable onPress={handleBackPress} style={styles.headerButton}>
          <Feather name="chevron-left" size={20} color={theme.colors.text} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          Create workspace
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <SectionBlock>
        <Text style={styles.introTitle}>Start your first workspace</Text>
        <Text style={styles.introCopy}>
          Create a separate workspace for your team, project, or personal work.
          You will go straight to the home screen once it is created.
        </Text>
      </SectionBlock>

      <SectionBlock>
        <Field
          label="Workspace name"
          placeholder="e.g. Product Team / My Team"
          value={name}
          onChangeText={setName}
          returnKeyType="done"
          onSubmitEditing={() => void handleCreateWorkspace()}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Button
          label={submitting ? "Creating..." : "Create workspace"}
          icon="plus"
          onPress={() => void handleCreateWorkspace()}
          disabled={submitting}
        />
      </SectionBlock>
    </ScreenScroll>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text,
  },
  headerSpacer: {
    width: 36,
  },
  introTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
  },
  introCopy: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.textMuted,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.danger,
  },
})
