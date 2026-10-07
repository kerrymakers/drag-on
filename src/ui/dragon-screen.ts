// The Dragon screen: the dragon, its four stats and how it has grown so far.
// Upcoming stages stay a surprise: no names, no art, just "???" and a lock.

import { itemSvg, react, renderDragon } from '../art'
import { dayKey } from '../game/day'
import type { LookId } from '../game/evolution'
import { stageHistory } from '../game/stage-history'
import { statTotals } from '../game/stats'
import type { GameEvent, MoodId, Settings, Stage, Stat, StatId, Task } from '../game/types'
import { wornList, type WornItems } from '../game/wearing'
import { DRAGON_SCREEN, MOOD_LABELS, dragonScreenLine, friendlyDay, lookLabel } from './copy'
import { ICONS } from './icons'
import { outfitOf } from './outfit'
import { watchScrollFade } from './scroll-fade'

export interface DragonScreenState {
  events: readonly GameEvent[]
  settings: Settings
  stage: Stage
  /** 0 to 1 toward the next stage, for the art. */
  progress: number
  mood: MoodId
  /** The evolution look: 'neutral' (nothing shown) before Juvenile. */
  look: LookId
  /** What's worn right now (derived: see wornItems). */
  worn: WornItems
  now: number
}

export interface DragonScreenConfig {
  tasks: readonly Task[]
  stats: readonly Stat[]
  stages: readonly Stage[]
}

export interface DragonScreen {
  render(state: DragonScreenState): void
}

/** Below this share of the top stat, a non-zero bar still shows a little rounded nub. */
const MIN_BAR = 0.05

/** Bar widths (0 to 1) scaled to the top stat. All zero if nothing has been logged. */
export function barFractions(values: readonly number[]): number[] {
  const top = Math.max(0, ...values)
  return values.map((v) => (top <= 0 || v <= 0 ? 0 : Math.max(MIN_BAR, v / top)))
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string) {
  const e = doc.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

const STAT_ICON: Record<StatId, string> = {
  strength: ICONS.strength,
  discipline: ICONS.discipline,
  wisdom: ICONS.wisdom,
  heart: ICONS.heart,
}

export function createDragonScreen(doc: Document, root: HTMLElement, config: DragonScreenConfig): DragonScreen {
  const scroller = el(doc, 'div', 'ds-scroll scroll-fade')

  const header = el(doc, 'header', 'ds-header')
  const name = el(doc, 'p', 'dragon-name')
  const stageRow = el(doc, 'div', 'stage-row')
  const stageName = el(doc, 'h1', 'stage-name')
  stageName.id = 'ds-title'
  const mood = el(doc, 'span', 'mood-chip')
  stageRow.append(stageName, mood)
  // The look's friendly name, from Juvenile on. Nothing before, so it stays a surprise.
  const lookChip = el(doc, 'p', 'look-chip')
  lookChip.hidden = true
  const lookIcon = el(doc, 'span', 'look-chip-icon')
  lookIcon.setAttribute('aria-hidden', 'true')
  const lookText = el(doc, 'span', 'look-chip-text')
  lookChip.append(lookIcon, lookText)
  header.append(name, stageRow, lookChip)

  const art = el(doc, 'div', 'ds-art')
  art.setAttribute('aria-hidden', 'true')
  art.addEventListener('click', () => react(art, 'tap'))
  const line = el(doc, 'p', 'ds-line')

  // Stats
  const statsCard = el(doc, 'section', 'ds-card')
  statsCard.setAttribute('aria-labelledby', 'ds-stats-title')
  const statsTitle = el(doc, 'h2', 'ds-card-title', DRAGON_SCREEN.statsTitle)
  statsTitle.id = 'ds-stats-title'
  const statList = el(doc, 'ul', 'stat-list')
  const statRows = config.stats.map((stat) => {
    const li = el(doc, 'li', 'stat')
    li.dataset.stat = stat.id
    const icon = el(doc, 'span', 'stat-icon')
    icon.innerHTML = STAT_ICON[stat.id]
    const label = el(doc, 'span', 'stat-name', stat.name)
    const value = el(doc, 'span', 'stat-value', '0')
    const track = el(doc, 'span', 'stat-bar')
    track.setAttribute('aria-hidden', 'true')
    const fill = el(doc, 'span', 'stat-fill')
    track.append(fill)
    li.append(icon, label, value, track)
    statList.append(li)
    return { id: stat.id, value, fill }
  })
  const statsEmpty = el(doc, 'p', 'ds-empty', DRAGON_SCREEN.statsEmpty)
  statsCard.append(statsTitle, statList, statsEmpty)

  // Stage history
  const historyCard = el(doc, 'section', 'ds-card')
  historyCard.setAttribute('aria-labelledby', 'ds-history-title')
  const historyTitle = el(doc, 'h2', 'ds-card-title', DRAGON_SCREEN.historyTitle)
  historyTitle.id = 'ds-history-title'
  const historyList = el(doc, 'ol', 'stage-history')
  historyCard.append(historyTitle, historyList)

  // What's worn
  const wearCard = el(doc, 'section', 'ds-card')
  wearCard.setAttribute('aria-labelledby', 'ds-wear-title')
  const wearTitle = el(doc, 'h2', 'ds-card-title', DRAGON_SCREEN.wearingTitle)
  wearTitle.id = 'ds-wear-title'
  const wearList = el(doc, 'ul', 'wear-list')
  const wearEmpty = el(doc, 'p', 'ds-empty wear-empty', DRAGON_SCREEN.wearingEmpty)
  const wearEgg = el(doc, 'p', 'ds-empty wear-egg', DRAGON_SCREEN.wearingEgg)
  wearCard.append(wearTitle, wearList, wearEmpty, wearEgg)

  scroller.append(header, art, line, statsCard, wearCard, historyCard)
  root.replaceChildren(scroller)
  const refreshFade = watchScrollFade(scroller)

  let historySignature = ''
  let wearSignature = ''

  function renderWearing(worn: WornItems, egg: boolean) {
    const items = wornList(worn)
    const signature = `${egg}|${items.map((i) => i.id).join(',')}`
    if (signature === wearSignature) return
    wearSignature = signature
    wearList.replaceChildren(
      ...items.map((item) => {
        const li = el(doc, 'li', 'wear-item')
        li.dataset.item = item.id
        const icon = el(doc, 'span', 'wear-icon')
        icon.setAttribute('aria-hidden', 'true')
        icon.innerHTML = itemSvg(item.id)
        li.append(icon, el(doc, 'span', 'wear-name', item.name))
        return li
      }),
    )
    wearList.hidden = items.length === 0
    wearEmpty.hidden = items.length > 0
    wearEgg.hidden = !egg || items.length === 0
  }

  function renderHistory(events: readonly GameEvent[], today: string) {
    const reached = stageHistory(events, config.stages)
    const lockedCount = Math.max(0, config.stages.length - reached.length)
    const signature = `${today}|${reached.map((r) => `${r.stage.id}@${r.dayKey}`).join(',')}|${lockedCount}`
    if (signature === historySignature) return
    historySignature = signature

    const items = reached.map((r, i) => {
      const li = el(doc, 'li', 'history-item is-reached')
      const isCurrent = i === reached.length - 1
      if (isCurrent) li.classList.add('is-current')
      const mark = el(doc, 'span', 'history-mark')
      mark.innerHTML = isCurrent ? ICONS.star : ICONS.check
      const label = el(doc, 'span', 'history-name', r.stage.name)
      const when = el(
        doc,
        'span',
        'history-date',
        r.dayKey === null ? DRAGON_SCREEN.firstStageWaiting : friendlyDay(r.dayKey, today),
      )
      li.append(mark, label, when)
      return li
    })
    for (let i = 0; i < lockedCount; i++) {
      const li = el(doc, 'li', 'history-item is-locked')
      li.setAttribute('aria-label', DRAGON_SCREEN.lockedLabel)
      const mark = el(doc, 'span', 'history-mark')
      mark.innerHTML = ICONS.lock
      const label = el(doc, 'span', 'history-name', DRAGON_SCREEN.locked)
      label.setAttribute('aria-hidden', 'true')
      li.append(mark, label)
      items.push(li)
    }
    historyList.replaceChildren(...items)
    line.textContent = dragonScreenLine(reached.length)
  }

  return {
    render(state) {
      name.textContent = state.settings.dragonName ?? 'your dragon'
      stageName.textContent = state.stage.name
      mood.textContent = MOOD_LABELS[state.mood]
      mood.dataset.mood = state.mood
      renderDragon(art, {
        stage: state.stage.id,
        progress: state.progress,
        mood: state.mood,
        look: state.look,
        wearing: outfitOf(state.worn),
      })
      renderWearing(state.worn, state.stage.id === 'egg')
      if (state.look === 'neutral') {
        lookChip.hidden = true
        delete lookChip.dataset.look
      } else if (lookChip.dataset.look !== state.look || lookChip.hidden) {
        lookChip.hidden = false
        lookChip.dataset.look = state.look
        lookIcon.innerHTML = STAT_ICON[state.look]
        lookText.textContent = lookLabel(state.look)
      }

      const totals = statTotals(state.events, config.tasks, config.stats)
      const fractions = barFractions(totals.map((t) => t.xp))
      totals.forEach((t, i) => {
        const row = statRows.find((r) => r.id === t.stat.id)
        if (!row) return
        row.value.textContent = String(t.xp)
        row.fill.style.width = `${Math.round((fractions[i] ?? 0) * 1000) / 10}%`
      })
      statsEmpty.hidden = totals.some((t) => t.xp > 0)

      renderHistory(state.events, dayKey(state.now))
      refreshFade()
    },
  }
}
