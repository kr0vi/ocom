export function relativeTime(timestamp?: number): string {
  if (!timestamp) return ''

  const delta = Date.now() - timestamp
  if (delta < 45_000) return 'now'
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`
  if (delta < 7 * 86_400_000) return `${Math.floor(delta / 86_400_000)}d`

  const date = new Date(timestamp)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function clockTime(timestamp?: number): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function basename(path?: string): string {
  if (!path) return ''
  const clean = path.replace(/[\\/]+$/, '')
  const index = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return index === -1 ? clean : clean.slice(index + 1)
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

export function compactPath(path?: string, max = 48): string {
  if (!path) return ''
  if (path.length <= max) return path
  const name = basename(path)
  const head = path.slice(0, Math.max(8, max - name.length - 3))
  return `${head}…${name.length < max - 10 ? `/${name}` : ''}`
}

export function errorText(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  const record = error as Record<string, unknown>
  const data = record.data as Record<string, unknown> | undefined
  const message = data?.message ?? record.message
  if (typeof message === 'string') return message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
