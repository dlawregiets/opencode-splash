/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { formatArtError, loadArtPaths, pickArt } from "./art.ts"
import { readOptions, resolveBackground } from "./options.ts"
import { MAX_TOAST_LENGTH, truncateText } from "./safety.ts"
import { Splash } from "./splash.tsx"

/**
 * Dismiss on the usual "get out of the way" keys and on printable keys.
 * Binding the printable keys also keeps the first characters a user types
 * from leaking into the prompt behind the splash.
 */
const DISMISS_KEYS = [
  "escape",
  "enter",
  "space",
  "tab",
  "backspace",
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."0123456789",
]

export default Plugin.define({
  id: "opencode-splash",
  setup(context) {
    const options = readOptions(context.options)

    const cwd = context.location?.directory ?? process.cwd()
    const { loaded, errors } = loadArtPaths(options.art, cwd)

    if (errors.length > 0) {
      const message = errors.slice(0, 3).map(formatArtError).join("\n")
      const safeMessage = truncateText(message, MAX_TOAST_LENGTH)
      context.ui.toast.show({
        title: "Splash art",
        message: safeMessage,
        variant: "warning",
        duration: 8000,
      })
    }

    // No configured art means no splash at all. Do not mark the splash as
    // shown, so adding art later can still display it.
    if (loaded.length === 0) return

    // Memory storage is shared across plugin reloads but reset when the TUI
    // exits, so the splash appears once per launch and not on /reload.
    const [state, updateState] = context.storage.memory("opencode-splash", {
      initial: { shown: false },
    })
    if (state.shown) return
    updateState((draft) => {
      draft.shown = true
    })

    const art = pickArt(
      loaded,
      context.renderer.width,
      context.renderer.height,
      options.size,
    )
    if (!art) return

    const theme = context.theme
    const background = resolveBackground(
      options.background,
      theme.background.base,
      theme.background.raised.base,
      context.themeMode,
    )
    const color = options.color ?? theme.text.base

    const [visible, setVisible] = createSignal(true)

    let timer: ReturnType<typeof setTimeout> | undefined
    let unregistered = false

    const unregister = context.ui.slot({
      append: "app",
      render: () => (
        <Splash
          rows={art.rows}
          width={art.width}
          background={background}
          color={color}
          hintColor={theme.text.faint}
          hint={options.duration > 0 ? "esc to skip" : "esc to close"}
        />
      ),
    })

    const remove = () => {
      if (unregistered) return
      unregistered = true
      unregister()
    }

    const hide = () => {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      setVisible(false)
      remove()
    }

    if (options.duration > 0) {
      timer = setTimeout(hide, options.duration)
    }

    context.keymap.layer(() => ({
      mode: "global",
      priority: 1_000_000,
      enabled: () => visible(),
      commands: DISMISS_KEYS.map((key) => ({
        id: `opencode-splash.dismiss.${key}`,
        bind: key,
        run: hide,
      })),
    }))

    return () => {
      if (timer !== undefined) clearTimeout(timer)
      remove()
    }
  },
})
