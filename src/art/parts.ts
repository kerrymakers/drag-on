// Shared pieces for the dragon drawings. Every colour is a CSS custom property
// (see art.css), and each svg carries data-stage and data-evolution, so Milestone 3
// can recolour or add features per stat without redrawing the stages.

/**
 * Mirrors a path drawn on the left across the centre line (x = 256).
 * Only absolute M, L, C, Q and Z are allowed, where every coordinate is an x y pair,
 * so flipping every other number is exactly right. Anything else (relative commands,
 * H, V, A, S, T, or exponent notation) throws rather than drawing something wrong.
 */
export function mirror(d: string): string {
  if (/[eE]/.test(d)) throw new Error(`mirror: exponent notation isn't supported: ${d}`)
  const bad = d.match(/[A-Za-z]/g)?.find((c) => !'MLCQZ'.includes(c))
  if (bad) throw new Error(`mirror: only absolute M, L, C, Q and Z are supported, got "${bad}"`)
  let isX = true
  return d.replace(/-?\d+(\.\d+)?|[MLCQZ]/g, (token) => {
    if (/[MLCQZ]/.test(token)) {
      isX = true
      return token
    }
    const out = isX ? String(512 - Number(token)) : token
    isX = !isX
    return out
  })
}

/** Both sides of a symmetric part. */
export const pair = (cls: string, d: string) =>
  `<path class="${cls}" d="${d}" /><path class="${cls}" d="${mirror(d)}" />`

export interface Eyes {
  y: number
  dx: number // distance of each eye from the centre line
  rx: number
  ry: number
}

/** Eyes with highlights, grouped so they blink together. */
export function eyes({ y, dx, rx, ry }: Eyes): string {
  const l = 256 - dx
  const r = 256 + dx
  const hr = Math.max(4, Math.round(rx * 0.36))
  return `<g class="dragon-eyes">
    <ellipse class="hd-eye" cx="${l}" cy="${y}" rx="${rx}" ry="${ry}" />
    <ellipse class="hd-eye" cx="${r}" cy="${y}" rx="${rx}" ry="${ry}" />
    <circle cx="${l + rx * 0.35}" cy="${y - ry * 0.4}" r="${hr}" fill="#fff" />
    <circle cx="${r + rx * 0.35}" cy="${y - ry * 0.4}" r="${hr}" fill="#fff" />
  </g>`
}

/** Wraps a drawing so it sits on the ground line and grows by `scale` from there. */
export function dragonSvg(stage: string, label: string, scale: number, body: string): string {
  return `
<svg class="dragon-svg dragon-${stage}" data-stage="${stage}" data-evolution="neutral" viewBox="0 0 512 512" role="img" aria-label="${label}">
  <g transform="translate(256 492) scale(${scale}) translate(-256 -492)">
    <g class="dragon-body">${body}</g>
  </g>
</svg>`
}
