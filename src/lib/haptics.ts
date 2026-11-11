import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'

// Web has no haptics engine; the module is a no-op there anyway, but skipping
// the call avoids noisy console warnings in the browser preview.
const enabled = Platform.OS !== 'web'

/** Light tap for sending a prompt or confirming an action. */
export function tapFeedback(): void {
  if (!enabled) return
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined)
}

/** Slightly stronger tap for selecting things or opening a sheet. */
export function selectFeedback(): void {
  if (!enabled) return
  void Haptics.selectionAsync().catch(() => undefined)
}

/** Success buzz for a completed action (connected, sent, approved). */
export function successFeedback(): void {
  if (!enabled) return
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
}

/** Warning buzz for destructive or interrupting actions. */
export function warningFeedback(): void {
  if (!enabled) return
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined)
}
