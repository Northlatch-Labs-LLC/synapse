import { Camera } from "expo-camera"
import { useRouter } from "expo-router"
import { Platform } from "react-native"
import { useState } from "react"

import { ScanCameraPermissionSheet } from "@/components/scan-camera-permission-sheet"

export function useScanLauncher(
  intent: "relationship" | "login" = "relationship"
) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function pushToScan() {
    router.push(`/scan?intent=${intent}`)
  }

  async function openScan() {
    const permission = await Camera.getCameraPermissionsAsync()

    if (permission.granted) {
      setErrorMessage(null)
      pushToScan()
      return
    }

    setErrorMessage(null)
    setSheetOpen(true)
  }

  async function authorizeAndOpen() {
    if (requesting) return

    setRequesting(true)
    try {
      const permission = await Camera.requestCameraPermissionsAsync()

      if (permission.granted) {
        setErrorMessage(null)
        setSheetOpen(false)
        pushToScan()
        return
      }

      setErrorMessage(
        Platform.OS === "web"
          ? "Camera access was not granted by the browser. Check the camera permission settings in the address bar and try again."
          : "Camera access was not granted. Please allow it and try again."
      )
    } finally {
      setRequesting(false)
    }
  }

  return {
    openScan,
    permissionSheet: (
      <ScanCameraPermissionSheet
        open={sheetOpen}
        requesting={requesting}
        errorMessage={errorMessage}
        onClose={() => {
          setSheetOpen(false)
          setErrorMessage(null)
        }}
        onAuthorize={() => void authorizeAndOpen()}
      />
    ),
  }
}
