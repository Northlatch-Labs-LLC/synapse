import { useRouter } from "expo-router"
import { StyleSheet, Text, View } from "react-native"

import { Button, EmptyState, ScreenView } from "@/components/ui"

export default function NotFoundScreen() {
  const router = useRouter()

  return (
    <ScreenView>
      <View style={styles.wrap}>
        <EmptyState
          icon="compass"
          title="Page not found"
          description="This mobile route has no content yet, or the link has expired."
        />
        <Button label="Back to home" onPress={() => router.replace("/")} />
      </View>
    </ScreenView>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 18,
    justifyContent: "center",
    gap: 18,
  },
})
