// A soft fade at the top and/or bottom edge of a scroll area, only while there's
// more to scroll that way. CSS draws it from the data-fade attribute.

/** Which edges have more content past them. 1px slack absorbs fractional scrolling. */
export function fadeEdges(scrollTop: number, scrollHeight: number, clientHeight: number): '' | 'top' | 'bottom' | 'both' {
  const above = scrollTop > 1
  const below = scrollHeight - clientHeight - scrollTop > 1
  if (above && below) return 'both'
  if (above) return 'top'
  if (below) return 'bottom'
  return ''
}

/** Keeps `el`'s data-fade up to date. Returns a function to call after changing its content. */
export function watchScrollFade(el: HTMLElement): () => void {
  const update = () => {
    const edges = fadeEdges(el.scrollTop, el.scrollHeight, el.clientHeight)
    if (edges) el.dataset.fade = edges
    else delete el.dataset.fade
  }
  el.addEventListener('scroll', update, { passive: true })
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(update)
    ro.observe(el)
    for (const child of el.children) ro.observe(child)
  } else {
    (el.ownerDocument.defaultView ?? window).addEventListener('resize', update)
  }
  update()
  return update
}
