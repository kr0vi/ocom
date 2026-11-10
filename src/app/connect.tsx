import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useConnection } from '@/lib/connection'
import { errorText } from '@/lib/format'
import { colors, font, radius, spacing } from '@/lib/theme'
import { AppText as Text, AppTextInput as TextInput, Button, Card, IconButton } from '@/components/ui'

export default function ConnectScreen() {
  const params = useLocalSearchParams<{ url?: string }>()
  const {
    connection,
    api,
    loading: connectionLoading,
    eventStatus,
    pairWithLink,
    disconnect,
  } = useConnection()

  const [link, setLink] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const scannedRef = useRef(false)

  // Handle `opencode-mobile://connect?url=...` deep links
  const deepLink = typeof params.url === 'string' ? params.url : ''
  const [appliedDeepLink, setAppliedDeepLink] = useState<string | null>(null)
  if (deepLink && deepLink !== appliedDeepLink) {
    setAppliedDeepLink(deepLink)
    setLink(deepLink)
  }

  // If credentials exist and connection works, redirect to sessions screen immediately
  const shouldVerify = Boolean(connection && api && !deepLink)
  const [verifyFailed, setVerifyFailed] = useState(false)
  const verifying = shouldVerify && !verifyFailed

  useEffect(() => {
    if (!shouldVerify || verifyFailed || !api) return

    // If event stream is already live, we know the connection is active
    if (eventStatus === 'live') {
      router.replace('/sessions')
      return
    }

    let active = true
    api
      .info()
      .then(() => {
        if (active) {
          router.replace('/sessions')
        }
      })
      .catch(() => {
        if (active) {
          setVerifyFailed(true)
        }
      })

    return () => {
      active = false
    }
  }, [shouldVerify, verifyFailed, api, eventStatus])

  if (connectionLoading || verifying) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    )
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

  const buildConnectUrl = (qrData: string): string | null => {
    try {
      const payload = JSON.parse(qrData);
      if (!payload?.code || !payload?.urls?.[0]) return null;
      const base = payload.urls[0].replace(/\/$/, '');
      return `${base}/auth/connect/${payload.code}`;
    } catch {
      return qrData.startsWith('http') ? qrData : null;
    }
  };

  const onScanned = ({ data }: { data: string }) => {
    if (scannedRef.current || busy) return;
    scannedRef.current = true;
    setScannerOpen(false);

    const url = buildConnectUrl(data);
    if (url) {
      void run(() => pairWithLink(url));
    } else {
      setError('Unable to read pairing QR code – please try again.');
    }
  };

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
          <View style={styles.container}>
            <View style={styles.brand}>
              <View style={styles.logo}>
                <Ionicons name="terminal" size={20} color={colors.accent} />
              </View>
              <Text style={styles.title}>OpenCode Remote</Text>
              <Text style={styles.subtitle}>
                Control an OpenCode server running on your computer, from your phone.
              </Text>
            </View>

            {connection ? (
              <Card style={styles.offlineCard}>
                <View style={styles.offlineRow}>
                  <Ionicons name="cloud-offline-outline" size={18} color={colors.amber} />
                  <View style={styles.offlineText}>
                    <Text style={styles.offlineTitle}>Previous connection unavailable</Text>
                    <Text style={styles.offlineHost} numberOfLines={1}>
                      {connection.label}
                    </Text>
                  </View>
                  <Button
                    label="Clear"
                    variant="secondary"
                    compact
                    onPress={() => void disconnect()}
                  />
                </View>
              </Card>
            ) : null}

            <Card style={styles.card}>
              <Text style={styles.cardBody}>
                Run the command below in your terminal, then scan the QR code it prints.
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
                      <Ionicons name="scan-outline" size={22} color={colors.accent} />
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
                label="Connect"
                compact
                onPress={() => void run(() => pairWithLink(link))}
                loading={busy}
                disabled={!link.trim() || scannerOpen}
                style={styles.connectButton}
                labelStyle={styles.connectButtonLabel}
              />
            </Card>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.red} />
                <Text selectable style={styles.errorText}>
                  {error}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  container: {
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    gap: spacing.md,
  },
  brand: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    gap: 6,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: 290,
  },
  offlineCard: {
    backgroundColor: colors.amberSoft,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
  },
  offlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  offlineText: {
    flex: 1,
    gap: 1,
  },
  offlineTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  offlineHost: {
    color: colors.textMuted,
    fontSize: 10.5,
    fontFamily: font.mono,
    textAlign: 'center',
  },
  card: {
    gap: spacing.md,
    padding: spacing.md + 2,
  },
  cardBody: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  command: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.codeBg,
    borderRadius: radius.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  commandPrompt: {
    color: colors.green,
    fontFamily: font.mono,
    fontSize: 11.5,
  },
  commandText: {
    color: colors.text,
    fontFamily: font.mono,
    fontSize: 11.5,
    textAlign: 'center',
  },
  scanPlaceholder: {
    height: 140,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  scanIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  scanLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  scanSub: {
    color: colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
  },
  cameraBox: {
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  scanFrame: {
    position: 'absolute',
    top: '20%',
    left: '20%',
    right: '20%',
    bottom: '20%',
    borderRadius: radius.sm,
  },
  cameraTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  cameraHint: {
    color: colors.white,
    fontSize: 11,
    flex: 1,
    textAlign: 'center',
  },
  cameraClose: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  orText: {
    color: colors.textFaint,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm + 2,
    color: colors.text,
    fontSize: 12.5,
    paddingHorizontal: spacing.md,
    height: 44,
    textAlign: 'center',
  },
  multiline: {
    height: 52,
    paddingTop: spacing.sm + 2,
    textAlignVertical: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.redSoft,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
  },
  errorText: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    flex: 1,
  },
  connectButton: {
    alignSelf: 'center',
    minHeight: 34,
    height: 34,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    marginTop: spacing.xs,
  },
  connectButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  pressed: {
    opacity: 0.75,
  },
})
