import { Redirect } from 'expo-router'
import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useConnection } from '@/lib/connection'
import { colors } from '@/lib/theme'

export default function Index() {
  const { loading, connection } = useConnection()

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  return <Redirect href={connection ? '/sessions' : '/connect'} />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
