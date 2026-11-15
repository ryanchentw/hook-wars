import type { Invite } from '../app/onlineMode';

/** The two ways to play, as the menu's tabs: against bots on this page, or in a room on the server. */
export const MENU_TABS = ['solo', 'friends'] as const;
export type MenuTab = (typeof MENU_TABS)[number];

export const TAB_LABELS: Readonly<Record<MenuTab, string>> = { solo: 'Solo', friends: 'With friends' };

/** What the gold button in the open tab does, which is also what Enter in the name field does. */
export type PrimaryAction = 'play' | 'create' | 'join';

export function parseMenuTab(raw: string | null): MenuTab | null {
  return MENU_TABS.find((tab) => tab === raw) ?? null;
}

/** A room to join outranks habit: a friend's link, or a seat just lost, opens With friends whatever was used last. */
export function openingTab(invite: Invite | null, remembered: MenuTab | null): MenuTab {
  if (invite !== null) return 'friends';
  return remembered ?? 'solo';
}

/** With a room on offer, joining it is the thing to do; otherwise a new room is. */
export function primaryAction(tab: MenuTab, invite: Invite | null): PrimaryAction {
  if (tab === 'solo') return 'play';
  return invite === null ? 'create' : 'join';
}

const STEPS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** The tab a key moves to from `current`, wrapping at the ends; null for a key the tab list does not handle. */
export function tabAfterKey(current: MenuTab, key: string): MenuTab | null {
  const count = MENU_TABS.length;
  const step = STEPS[key];
  let to: number | null = null;
  if (key === 'Home') to = 0;
  else if (key === 'End') to = count - 1;
  else if (step !== undefined) to = (MENU_TABS.indexOf(current) + step + count) % count;
  return to === null ? null : (MENU_TABS[to] ?? null);
}
