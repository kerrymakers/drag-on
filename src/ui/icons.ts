// Small inline UI icons (not dragon art). All use currentColor and a 24×24 grid.

const svg = (body: string) =>
  `<svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

export const ICONS = {
  home: svg('<path d="M4 11.2 12 4.5l8 6.7"/><path d="M6.2 9.6V19a1 1 0 0 0 1 1h3.3v-5h3v5h3.3a1 1 0 0 0 1-1V9.6"/>'),
  dragon: svg(
    '<path d="M8 8.2 6.6 4.2l3.6 2.6M16 8.2l1.4-4 -3.6 2.6"/><path d="M12 6.4c4 0 6.8 2.6 6.8 6.2 0 3.9-3 6.9-6.8 6.9s-6.8-3-6.8-6.9c0-3.6 2.8-6.2 6.8-6.2Z"/><circle cx="9.5" cy="12.4" r=".9" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12.4" r=".9" fill="currentColor" stroke="none"/><path d="M10.6 15.6c.8.6 2 .6 2.8 0"/>',
  ),
  strength: svg(
    '<path d="M3.5 9.5v5M6.5 7.5v9M17.5 7.5v9M20.5 9.5v5M6.5 12h11"/>',
  ),
  discipline: svg('<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.4 1.6M5 5.5 7.4 3.6M19 5.5l-2.4-1.9"/>'),
  wisdom: svg(
    '<path d="M12 6.5c-1.8-1.3-4.3-1.8-7.5-1.5v13c3.2-.3 5.7.2 7.5 1.5 1.8-1.3 4.3-1.8 7.5-1.5V5c-3.2-.3-5.7.2-7.5 1.5Z"/><path d="M12 6.5v13"/>',
  ),
  heart: svg(
    '<path d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6Z"/>',
  ),
  collection: svg(
    '<path d="M4.5 10.5h15v8a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M4.5 10.5a7.5 5 0 0 1 15 0"/><path d="M10.5 12.5h3v2.2a1.5 1.5 0 0 1-3 0Z"/>',
  ),
  lock: svg('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  check: svg('<path d="m6 12.5 4 4 8-9"/>'),
  star: svg('<path d="m12 4.5 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7Z"/>'),
} as const

export type IconName = keyof typeof ICONS
