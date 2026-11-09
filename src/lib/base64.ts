const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * Base64 encode a UTF-8 string.
 *
 * Hermes does not reliably expose `btoa`, so we implement the encoding
 * ourselves on top of `TextEncoder` (available in SDK 58 / RN 0.88).
 */
export function encodeBase64(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let output = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const byte1 = bytes[i]
    const byte2 = i + 1 < bytes.length ? bytes[i + 1] : undefined
    const byte3 = i + 2 < bytes.length ? bytes[i + 2] : undefined

    output += ALPHABET[byte1 >> 2]
    output += ALPHABET[((byte1 & 0x03) << 4) | ((byte2 ?? 0) >> 4)]

    if (byte2 === undefined) {
      output += '=='
      continue
    }

    output += ALPHABET[((byte2 & 0x0f) << 2) | ((byte3 ?? 0) >> 6)]

    if (byte3 === undefined) {
      output += '='
      continue
    }

    output += ALPHABET[byte3 & 0x3f]
  }

  return output
}
