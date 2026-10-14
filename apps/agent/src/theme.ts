// Colour tokens and type from docs/DESIGN.md
export const colors = {
  ink: '#17181C',
  muted: '#55585F',
  ground: '#F4F2EC',
  surface: '#FFFFFF',
  line: '#DEDAD0',
  red: '#A3231B',
  redSoft: '#F6DEDB',
  yellow: '#F2C230',
  yellowSoft: '#FBEFC4',
  green: '#1E6B45',
  greenSoft: '#DCEFE3',
  blue: '#1F4E9C',
  /** Secondary text on the ink header. */
  onInkMuted: '#C9CBD1',
} as const;

/** Font family names registered in app/_layout.tsx. */
export const fonts = {
  regular: 'PublicSans_400Regular',
  semibold: 'PublicSans_600SemiBold',
  bold: 'PublicSans_700Bold',
  extrabold: 'PublicSans_800ExtraBold',
  mono: 'IBMPlexMono_500Medium',
  monoBold: 'IBMPlexMono_600SemiBold',
} as const;

/** NFR-04: touch targets at least 44 px; primary buttons at least 56. */
export const sizes = {
  touch: 48,
  button: 60,
  radius: 14,
} as const;
