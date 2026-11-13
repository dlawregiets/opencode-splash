import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import plugin from "../src/tui.tsx"

const artDir = mkdtempSync(join(tmpdir(), "opencode-splash-tui-"))
const artFile = join(artDir, "art.txt")
writeFileSync(artFile, "ART\n")

afterAll(() => {
  rmSync(artDir, { recursive: true, force: true })
})

type Claim = {
  append?: string
  render: () => unknown
}

type Toast = {
  title?: string
  message: string
  variant?: string
  duration?: number
}

type Layer = {
  mode?: string
  priority?: number
  enabled?: () => boolean
  commands?: readonly {
    id?: string
    bind?: string | false
    run?: () => void | false | Promise<void>
  }[]
}

function makeContext(options: Readonly<Record<string, unknown>> = {}) {
  const mergedOptions = { art: { large: artFile }, ...options }
  const claims: Claim[] = []
  const layers: Layer[] = []
  const toasts: Toast[] = []
  const state = { shown: false }
  let initialized = false
  let unregistered = false

  const context = {
    options: mergedOptions,
    location: { directory: artDir },
    theme: {
      background: { base: { a: 1 }, raised: { base: { a: 1 } } },
      text: { base: { a: 1 }, faint: { a: 1 } },
    },
    themeMode: "dark",
    renderer: { width: 100, height: 30 },
    storage: {
      memory: (_key: string, opts: { initial: { shown: boolean } }) => {
        // The real memory store keeps its existing value across reloads.
        if (!initialized) {
          state.shown = opts.initial.shown
          initialized = true
        }
        return [state, (mutation: (draft: { shown: boolean }) => void) => mutation(state)] as const
      },
    },
    ui: {
      slot: (claim: Claim) => {
        claims.push(claim)
        return () => {
          unregistered = true
        }
      },
      toast: {
        show: (toast: Toast) => {
          toasts.push(toast)
        },
      },
    },
    keymap: {
      layer: (factory: () => Layer) => {
        layers.push(factory())
      },
    },
  }

  return {
    context: context as never,
    claims,
    layers,
    toasts,
    state,
    isUnregistered: () => unregistered,
  }
}

describe("TUI plugin", () => {
  test("registers the app overlay and dismiss keymap", () => {
    const { context, claims, layers, isUnregistered } = makeContext()
    const cleanup = plugin.setup(context) as () => void

    expect(claims).toHaveLength(1)
    expect(claims[0]?.append).toBe("app")
    expect(typeof claims[0]?.render).toBe("function")

    expect(layers).toHaveLength(1)
    expect(layers[0]?.mode).toBe("global")
    expect(layers[0]?.enabled?.()).toBe(true)
    expect(layers[0]?.commands?.length).toBe(41)

    expect(isUnregistered()).toBe(false)
    cleanup()
    expect(isUnregistered()).toBe(true)
  })

  test("does not register a second overlay after the first setup", () => {
    const { context, claims, state } = makeContext()
    const cleanup = plugin.setup(context) as () => void
    expect(claims).toHaveLength(1)
    expect(state.shown).toBe(true)

    cleanup()
    expect(plugin.setup(context)).toBeUndefined()
    expect(claims).toHaveLength(1)
  })

  test("dismisses on a key by removing the overlay", () => {
    const { context, layers, isUnregistered } = makeContext()
    plugin.setup(context)
    expect(isUnregistered()).toBe(false)

    layers[0]?.commands?.[0]?.run?.()
    expect(isUnregistered()).toBe(true)
    expect(layers[0]?.enabled?.()).toBe(false)
  })

  test("supports waiting for a key instead of a timer", () => {
    const { context, claims, layers } = makeContext({ duration: 0 })
    const cleanup = plugin.setup(context) as () => void

    expect(claims).toHaveLength(1)
    expect(layers).toHaveLength(1)
    cleanup()
  })

  test("warns when an art file cannot be read", () => {
    const { context, claims, toasts } = makeContext({
      art: { large: "/definitely/missing/art.txt" },
    })
    plugin.setup(context)

    expect(claims).toHaveLength(0)
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.variant).toBe("warning")
    expect(toasts[0]?.message).toContain("large:")
  })

  test("does not register an overlay when no art is configured", () => {
    const { context, claims, toasts, state } = makeContext({ art: {} })
    expect(plugin.setup(context)).toBeUndefined()

    expect(claims).toHaveLength(0)
    expect(toasts).toHaveLength(0)
    expect(state.shown).toBe(false)
  })
})
