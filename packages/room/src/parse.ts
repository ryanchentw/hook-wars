import type { TeamId } from '@hookwars/sim';
import { KILL_TARGETS, SCENE_IDS, SLOTS_PER_TEAM, TEAMS, type KillTarget, type PlayerName, type SceneChoice, type SlotRef } from './types';

export const NAME_MAX_LENGTH = 16;
const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u;

export type NameResult = { readonly ok: true; readonly name: PlayerName } | { readonly ok: false; readonly error: string };

/** Length counts characters as people see them in most names, so one emoji is one, not two UTF-16 units. */
export function parseName(raw: unknown): NameResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Enter a name.' };
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: 'Enter a name.' };
  if (CONTROL.test(name)) return { ok: false, error: 'Use letters, numbers and punctuation only.' };
  if ([...name].length > NAME_MAX_LENGTH) return { ok: false, error: `Use at most ${NAME_MAX_LENGTH} characters.` };
  return { ok: true, name: name as PlayerName };
}

export function parseScene(raw: unknown): SceneChoice | null {
  if (raw === 'rotate') return raw;
  return (SCENE_IDS as readonly unknown[]).includes(raw) ? (raw as SceneChoice) : null;
}

export function parseKillTarget(raw: unknown): KillTarget | null {
  return (KILL_TARGETS as readonly unknown[]).includes(raw) ? (raw as KillTarget) : null;
}

export function isSlotRef(raw: SlotRef): boolean {
  return (TEAMS as readonly unknown[]).includes(raw.team as TeamId) && Number.isInteger(raw.index) && raw.index >= 0 && raw.index < SLOTS_PER_TEAM;
}
