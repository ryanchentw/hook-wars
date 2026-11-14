import type { TeamId } from '@hookbrawl/sim';
import { SCENE_IDS, TEAMS, type MemberId, type RoomState, type SceneChoice, type SceneId, type Slot, type SlotRef } from './types';

export type SeatedSlot = { readonly ref: SlotRef; readonly slot: Slot };

/** Every slot with its address, west first, in slot order. */
export function allSlots(state: RoomState): readonly SeatedSlot[] {
  return TEAMS.flatMap((team) => state.slots[team].map((slot, index) => ({ ref: { team, index }, slot })));
}

export function slotAt(state: RoomState, ref: SlotRef): Slot | undefined {
  return state.slots[ref.team][ref.index];
}

export function seatOf(state: RoomState, member: MemberId): SlotRef | null {
  return allSlots(state).find(({ slot }) => slot.kind === 'human' && slot.memberId === member)?.ref ?? null;
}

export function fighterCount(state: RoomState, team: TeamId): number {
  return state.slots[team].filter((slot) => slot.kind !== 'empty').length;
}

export function hasEmptySlot(state: RoomState): boolean {
  return allSlots(state).some(({ slot }) => slot.kind === 'empty');
}

export function canStart(state: RoomState): boolean {
  return state.phase.kind === 'lobby' && TEAMS.every((team) => fighterCount(state, team) > 0);
}

export function sceneFor(choice: SceneChoice, matchIndex: number): SceneId {
  if (choice !== 'rotate') return choice;
  const turn = ((Math.floor(matchIndex) % SCENE_IDS.length) + SCENE_IDS.length) % SCENE_IDS.length;
  return SCENE_IDS[turn] ?? SCENE_IDS[0];
}

/** The scene the next match will be played in. */
export function upcomingScene(state: RoomState): SceneId {
  return sceneFor(state.settings.scene, state.matchesStarted);
}

const BOT_NAMES: Readonly<Record<TeamId, readonly string[]>> = {
  west: ['Rook', 'Gull', 'Tern'],
  east: ['Pike', 'Eel', 'Skate'],
};

/** Each slot has its own bot name, so a 3v3 feed can tell the bots apart. */
export function botName(ref: SlotRef): string {
  return BOT_NAMES[ref.team][ref.index] ?? `Bot ${ref.index + 1}`;
}
