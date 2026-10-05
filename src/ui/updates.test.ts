import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUpdateGate, type VisibilitySource } from './updates'

function fakeDoc() {
  const target = new EventTarget()
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: target.addEventListener.bind(target),
  }
  const setVisibility = (state: DocumentVisibilityState) => {
    doc.visibilityState = state
    target.dispatchEvent(new Event('visibilitychange'))
  }
  return { doc: doc as unknown as VisibilitySource, setVisibility }
}

describe('update gate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('waits until about 10s after the last log before reloading', () => {
    const { doc } = fakeDoc()
    const reload = vi.fn()
    const gate = createUpdateGate(doc, reload)
    gate.noteActivity()
    gate.requestReload()
    vi.advanceTimersByTime(8_000)
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(4_000)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('restarts the wait when another log happens', () => {
    const { doc } = fakeDoc()
    const reload = vi.fn()
    const gate = createUpdateGate(doc, reload)
    gate.requestReload()
    vi.advanceTimersByTime(8_000)
    gate.noteActivity()
    vi.advanceTimersByTime(8_000)
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(4_000)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('never reloads while an overlay is open', () => {
    const { doc } = fakeDoc()
    const reload = vi.fn()
    const gate = createUpdateGate(doc, reload)
    gate.setBusy(true)
    gate.requestReload()
    vi.advanceTimersByTime(60_000)
    expect(reload).not.toHaveBeenCalled()
    gate.setBusy(false)
    vi.advanceTimersByTime(12_000)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads straight away when the page is hidden, even mid-overlay', () => {
    const { doc, setVisibility } = fakeDoc()
    const reload = vi.fn()
    const gate = createUpdateGate(doc, reload)
    gate.noteActivity()
    gate.setBusy(true)
    gate.requestReload()
    expect(reload).not.toHaveBeenCalled()
    setVisibility('hidden')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing until an update is actually waiting, and reloads only once', () => {
    const { doc, setVisibility } = fakeDoc()
    const reload = vi.fn()
    const gate = createUpdateGate(doc, reload)
    setVisibility('hidden')
    vi.advanceTimersByTime(60_000)
    expect(reload).not.toHaveBeenCalled()
    gate.requestReload()
    gate.requestReload()
    vi.advanceTimersByTime(60_000)
    setVisibility('hidden')
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
