/**
 * What every Playwright page starts with: the graphics setting a player would pick on a slow machine. The suites draw
 * WebGL in software, where the glow and reflection passes would cost each frame several times over; a spec that is
 * about them asks for them with `?quality=high`.
 */
export function automationStorage(origin: string): { readonly cookies: []; readonly origins: { readonly origin: string; readonly localStorage: { readonly name: string; readonly value: string }[] }[] } {
  return { cookies: [], origins: [{ origin, localStorage: [{ name: 'hookwars.quality', value: 'low' }] }] };
}
