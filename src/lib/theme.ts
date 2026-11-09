export const colors = {
  bg: '#0B0D10',
  bgElevated: '#101318',
  surface: '#15191F',
  surfaceAlt: '#1B2028',
  surfacePressed: '#232A34',
  border: '#242B35',
  borderStrong: '#313A47',
  text: '#E9ECF1',
  textMuted: '#94A0AF',
  textFaint: '#68727F',
  accent: '#7C9CFF',
  accentStrong: '#5C84FF',
  accentSoft: 'rgba(124, 156, 255, 0.14)',
  accentBorder: 'rgba(124, 156, 255, 0.34)',
  green: '#4ADE80',
  greenSoft: 'rgba(74, 222, 128, 0.13)',
  amber: '#FBBF24',
  amberSoft: 'rgba(251, 191, 36, 0.13)',
  red: '#F87171',
  redSoft: 'rgba(248, 113, 113, 0.13)',
  codeBg: '#0D1014',
  white: '#FFFFFF',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const

export const font = {
  mono: 'monospace' as const,
}

export const layout = {
  maxContentWidth: 760,
} as const
