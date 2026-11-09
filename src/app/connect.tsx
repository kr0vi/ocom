import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useConnection } from '@/lib/connection'
import { errorText } from '@/lib/format'
import { colors, font, radius, spacing } from '@/lib/theme'
import { Button, Card, IconButton } from '@/components/ui'

type Mode = 'pair' | 'password'

export default function ConnectScreen() {
  const params = useLocalSearchParams<{ url?: string }>()
  const {
    connection,
    pairWithLink,
    connectManual,
    disconnect,
  } = useConnection()

  const [mode, setMode] = useState<Mode>('pair')
  const [link, setLink] = useState('')
  const [url, setUrl] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const scannedRef = useRef(false)

  // Handle `opencode-mobile://connect?url=...` deep links. Adjusting state
  // during render is the recommended way to react to a changed prop.
  const deepLink = typeof params.url === 'string' ? params.url : ''
  const [appliedDeepLink, setAppliedDeepLink] = useState<string | null>(null)
  if (deepLink && deepLink !== appliedDeepLink) {
    setAppliedDeepLink(deepLink)
    setMode('pair')
    setLink(deepLink)
  }

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
      router.replace('/sessions')
    } catch (cause) {
      setError(errorText(cause))
      scannedRef.current = false
    } finally {
      setBusy(false)
    }
  }

  const openScanner = async () => {
    setError(null)
    try {
      const result = permission?.granted ? permission : await requestPermission()
      if (result?.granted) {
        scannedRef.current = false
        setScannerOpen(true)
      } else {
        setError('Camera permission is required to scan the pairing QR code.')
      }
    } catch {
      setError('Could not open the camera. Paste the pairing link instead.')
    }
  }

  const onScanned = ({ data }: { data: string }) => {
    if (scannedRef.current || busy) return
    scannedRef.current = true
    setScannerOpen(false)
    void run(() => pairWithLink(data))
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Ionicons name="terminal" size={26} color={colors.accent} />
            </View>
            <Text style={styles.title}>OpenCode Remote</Text>
            <Text style={styles.subtitle}>
              Control an OpenCode server running on your computer, from your phone.
            </Text>
          </View>

          {connection ? (
            <Card style={styles.connectedCard}>
              <View style={styles.connectedRow}>
                <View style={styles.connectedIcon}>
                  <Ionicons name="checkmark" size={18} color={colors.green} />
                </View>
                <View style={styles.connectedText}>
                  <Text style={styles.connectedTitle}>Connected</Text>
                  <Text style={styles.connectedHost} numberOfLines={1}>
                    {connection.label}
                  </Text>
                </View>
              </View>
              <View style={styles.connectedActions}>
                <Button
                  label="Continue"
                  onPress={() => router.replace('/sessions')}
                  style={styles.flex}
                />
                <Button
                  label="Disconnect"
                  variant="secondary"
                  onPress={() => void disconnect()}
                  style={styles.flex}
                />
              </View>
            </Card>
          ) : null}

          <View style={styles.segmented}>
            <Segment
              label="Pairing link"
              icon="qr-code-outline"
              active={mode === 'pair'}
              onPress={() => setMode('pair')}
            />
            <Segment
              label="Password"
              icon="key-outline"
              active={mode === 'password'}
              onPress={() => setMode('password')}
            />
          </View>

          {mode === 'pair' ? (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Scan from your PC</Text>
              <Text style={styles.cardBody}>
                Run the command below, then scan the QR code it prints.
              </Text>

              <View style={styles.command}>
                <Text style={styles.commandPrompt}>$</Text>
                <Text selectable style={styles.commandText}>
                  opencode pair --remote
                </Text>
              </View>

              {scannerOpen ? (
                <View style={styles.cameraBox}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={onScanned}
                  />
                  <View style={styles.scanFrame} pointerEvents="none" />
                  <View style={styles.cameraTopBar}>
                    <Text style={styles.cameraHint}>Point at the pairing QR code</Text>
                    <IconButton
                      icon="close"
                      accessibilityLabel="Close scanner"
                      onPress={() => setScannerOpen(false)}
                      color={colors.white}
                      style={styles.cameraClose}
                      filled
                    />
                  </View>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Scan pairing QR code"
                  onPress={() => void openScanner()}
                  style={({ pressed }) => [styles.scanPlaceholder, pressed && styles.pressed]}
                >
                  <View style={styles.scanIcon}>
                    {permission === null ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Ionicons name="scan-outline" size={30} color={colors.accent} />
                    )}
                  </View>
                  <Text style={styles.scanLabel}>Scan pairing QR code</Text>
                  <Text style={styles.scanSub}>Uses your camera</Text>
                </Pressable>
              )}

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or paste the link</Text>
                <View style={styles.orLine} />
              </View>

              <TextInput
                value={link}
                onChangeText={setLink}
                placeholder="https://…/auth/connect/…"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, styles.multiline]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                keyboardAppearance="dark"
                multiline
              />

              <Button
                label="Connect with pairing link"
                icon="link-outline"
                onPress={() => void run(() => pairWithLink(link))}
                loading={busy}
                disabled={!link.trim() || scannerOpen}
              />
            </Card>
          ) : (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Manual connection</Text>
              <Text style={styles.cardBody}>
                Use the server address and password. This also works with a LAN address or any
                HTTPS tunnel.
              </Text>

              <Field label="Server URL">
                <TextInput
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://your-server.example"
                  placeholderTextColor={colors.textFaint}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  keyboardAppearance="dark"
                />
              </Field>

              <Field label="Password">
                <View style={styles.passwordRow}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Server password"
                    placeholderTextColor={colors.textFaint}
                    style={[styles.input, styles.passwordInput]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPassword}
                    keyboardAppearance="dark"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    onPress={() => setShowPassword((value) => !value)}
                    hitSlop={8}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={19}
                      color={colors.textMuted}
                    />
                  </Pressable>
                </View>
              </Field>

              <Button
                label="Connect"
                icon="log-in-outline"
                onPress={() => void run(() => connectManual(url, password))}
                loading={busy}
                disabled={!url.trim() || !password.trim()}
              />
            </Card>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={17} color={colors.red} />
              <Text selectable style={styles.errorText}>
                {error}
              </Text>
            </View>
          ) : null}

          <View style={styles.steps}>
            <Text style={styles.stepsTitle}>How it works</Text>
            <Step index="1" text="Start OpenCode on your computer." />
            <Step index="2" text="Run the pairing command and scan the QR code." />
            <Step index="3" text="Chat, watch progress, and approve tool permissions." />
            <Text style={styles.stepsFootnote}>
              Pairing links work once and expire after 5 minutes. The connection is stored securely
              on this device.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Segment({
  label,
  icon,
  active,
  onPress,
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segment, active && styles.segmentActive]}
    >
      <Ionicons name={icon} size={16} color={active ? colors.accent : colors.textMuted} />
      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{label}</Text>
    </Pressable>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

function Step({ index, text }: { index: string; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepIndex}>
        <Text style={styles.stepIndexText}>{index}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  brand: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  logo: {
    width: 62,
    height: 62,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  connectedCard: {
    gap: spacing.md,
    borderColor: 'rgba(74, 222, 128, 0.25)',
    backgroundColor: 'rgba(74, 222, 128, 0.06)',
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  connectedIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedText: {
    flex: 1,
    gap: 1,
  },
  connectedTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  connectedHost: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: font.mono,
  },
  connectedActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 40,
    borderRadius: radius.sm,
  },
  segmentActive: {
    backgroundColor: colors.surfaceAlt,
  },
  segmentLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  segmentLabelActive: {
    color: colors.text,
  },
  card: {
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  cardBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  command: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.codeBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  commandPrompt: {
    color: colors.green,
    fontFamily: font.mono,
    fontSize: 13,
  },
  commandText: {
    color: colors.text,
    fontFamily: font.mono,
    fontSize: 13,
  },
  scanPlaceholder: {
    height: 190,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  scanIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  scanLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  scanSub: {
    color: colors.textFaint,
    fontSize: 12,
  },
  cameraBox: {
    height: 260,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  scanFrame: {
    position: 'absolute',
    top: '22%',
    left: '20%',
    right: '20%',
    bottom: '22%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: radius.md,
  },
  cameraTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  cameraHint: {
    color: colors.white,
    fontSize: 12,
    flex: 1,
  },
  cameraClose: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  orText: {
    color: colors.textFaint,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  multiline: {
    height: 66,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.redSoft,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.28)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  steps: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepsTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndexText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  stepText: {
    color: colors.textMuted,
    fontSize: 13,
    flex: 1,
    lineHeight: 19,
  },
  stepsFootnote: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  pressed: {
    opacity: 0.75,
  },
})
