import { isValidColor, isValidPathString } from "./safety.ts"

export const ART_SIZES = ["large", "medium", "small"] as const

export type ArtSize = (typeof ART_SIZES)[number]
export type SplashSize = "auto" | ArtSize
export type ArtPaths = Partial<Record<ArtSize, string>>

export type ThemeMode = "dark" | "light"

/** The subset of an OpenTUI RGBA needed to decide whether a color is opaque. */
export type ThemeColor = {
  readonly a: number
}

export type SplashOptions = {
  /** How long the splash stays up, in milliseconds. 0 waits for a key. */
  readonly duration: number
  /** "theme" follows the active TUI theme; otherwise a validated color. */
  readonly background: string
  /** Art color. Defaults to the theme's primary text color. */
  readonly color: string | undefined
  /** Force an art size, or pick the best fitting size automatically. */
  readonly size: SplashSize
  /** Optional paths to UTF-8 text files for each art size. */
  readonly art: ArtPaths
}

export const DEFAULT_DURATION = 4000
export const DEFAULT_BACKGROUND = "theme"
export const DEFAULT_SIZE: SplashSize = "auto"

function integerOption(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function backgroundOption(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_BACKGROUND
  const trimmed = value.trim()
  if (trimmed === DEFAULT_BACKGROUND) return DEFAULT_BACKGROUND
  return isValidColor(trimmed) ? trimmed : DEFAULT_BACKGROUND
}

function colorOption(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return isValidColor(trimmed) ? trimmed : undefined
}

function sizeOption(value: unknown): SplashSize {
  return ART_SIZES.includes(value as ArtSize) ? (value as ArtSize) : DEFAULT_SIZE
}

function artPathsOption(value: unknown): ArtPaths {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const paths: ArtPaths = {}
  for (const size of ART_SIZES) {
    const path = raw[size]
    if (typeof path !== "string") continue
    const trimmed = path.trim()
    if (isValidPathString(trimmed)) {
      paths[size] = trimmed
    }
  }
  return paths
}

export function readOptions(raw: Readonly<Record<string, unknown>>): SplashOptions {
  return {
    duration: integerOption(raw.duration, DEFAULT_DURATION, 0, 60_000),
    background: backgroundOption(raw.background),
    color: colorOption(raw.color),
    size: sizeOption(raw.size),
    art: artPathsOption(raw.art),
  }
}

/**
 * Resolve the overlay background. Transparent theme backgrounds fall through
 * to the raised surface, then to a solid light/dark default.
 */
export function resolveBackground<Color extends ThemeColor>(
  background: string,
  base: Color,
  raised: Color,
  mode: ThemeMode,
): string | Color {
  if (background !== "theme" && isValidColor(background)) return background
  if (base.a > 0) return base
  if (raised.a > 0) return raised
  return mode === "light" ? "#FFFFFF" : "#0B0B0B"
}
