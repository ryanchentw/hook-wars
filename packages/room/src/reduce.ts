import { isSlotRef, parseKillTarget, parseName, parseScene } from './parse';
import { allSlots, canStart, fighterCount, hasEmptySlot, seatOf, slotAt } from './selectors';
import { SLOTS_PER_TEAM, type MemberId, type RoomAction, type RoomState, type Slot, type SlotRef } from './types';

const EMPTY: Slot = { kind: 'empty' };
const BOT: Slot = { kind: 'bot' };

export function createRoom(): RoomState {
  const empty = Array.from({ length: SLOTS_PER_TEAM }, () => EMPTY);
  return {
    host: null,
    slots: { west: empty, east: empty },
    settings: { scene: 'rotate', killTarget: 10, fog: false },
    phase: { kind: 'lobby' },
    matchesStarted: 0,
  };
}

function withSlot(state: RoomState, ref: SlotRef, slot: Slot): RoomState {
  const team = state.slots[ref.team].map((old, i) => (i === ref.index ? slot : old));
  return { ...state, slots: { ...state.slots, [ref.team]: team } };
}

function mapSlots(state: RoomState, fn: (slot: Slot) => Slot): RoomState {
  return { ...state, slots: { west: state.slots.west.map(fn), east: state.slots.east.map(fn) } };
}

const isEmptyAt = (state: RoomState, ref: SlotRef): boolean => isSlotRef(ref) && slotAt(state, ref)?.kind === 'empty';
const inLobby = (state: RoomState): boolean => state.phase.kind === 'lobby';
/** Bots, settings and starting are the host's, and only between matches. */
const hostInLobby = (state: RoomState, by: MemberId): boolean => inLobby(state) && state.host === by;

function join(state: RoomState, by: MemberId, rawName: string): RoomState {
  const parsed = parseName(rawName);
  if (!parsed.ok || seatOf(state, by) !== null) return state;
  const [first, second] = fighterCount(state, 'east') < fighterCount(state, 'west') ? (['east', 'west'] as const) : (['west', 'east'] as const);
  const free = [first, second].flatMap((team) => allSlots(state).filter(({ ref, slot }) => ref.team === team && slot.kind === 'empty'))[0];
  if (free === undefined) return state;
  const seated = withSlot(state, free.ref, { kind: 'human', memberId: by, name: parsed.name });
  return { ...seated, host: state.host ?? by };
}

function leave(state: RoomState, by: MemberId): RoomState {
  const seat = seatOf(state, by);
  if (seat === null) return state;
  const freed = withSlot(state, seat, EMPTY);
  if (state.host !== by) return freed;
  const heir = allSlots(freed).find(({ slot }) => slot.kind === 'human')?.slot;
  return { ...freed, host: heir?.kind === 'human' ? heir.memberId : null };
}

function rename(state: RoomState, by: MemberId, rawName: string): RoomState {
  const parsed = parseName(rawName);
  const seat = seatOf(state, by);
  return parsed.ok && seat !== null ? withSlot(state, seat, { kind: 'human', memberId: by, name: parsed.name }) : state;
}

function moveTo(state: RoomState, by: MemberId, to: SlotRef): RoomState {
  const from = seatOf(state, by);
  if (from === null || !inLobby(state) || !isEmptyAt(state, to)) return state;
  const seat = slotAt(state, from) ?? EMPTY;
  return withSlot(withSlot(state, from, EMPTY), to, seat);
}

type Handlers = { readonly [K in RoomAction['kind']]: (state: RoomState, action: Extract<RoomAction, { kind: K }>) => RoomState };

const HANDLERS: Handlers = {
  join: (s, a) => join(s, a.by, a.name),
  leave: (s, a) => leave(s, a.by),
  passHost: (s, a) => (s.host === a.by && a.to !== a.by && seatOf(s, a.to) !== null ? { ...s, host: a.to } : s),
  rename: (s, a) => rename(s, a.by, a.name),
  moveTo: (s, a) => moveTo(s, a.by, a.slot),
  addBot: (s, a) => (hostInLobby(s, a.by) && isEmptyAt(s, a.slot) ? withSlot(s, a.slot, BOT) : s),
  removeBot: (s, a) => (hostInLobby(s, a.by) && isSlotRef(a.slot) && slotAt(s, a.slot)?.kind === 'bot' ? withSlot(s, a.slot, EMPTY) : s),
  fillWithBots: (s, a) =>
    hostInLobby(s, a.by) && hasEmptySlot(s) ? mapSlots(s, (slot) => (slot.kind === 'empty' ? BOT : slot)) : s,
  setScene(s, a) {
    const scene = parseScene(a.scene);
    return hostInLobby(s, a.by) && scene !== null && scene !== s.settings.scene ? { ...s, settings: { ...s.settings, scene } } : s;
  },
  setKillTarget(s, a) {
    const killTarget = parseKillTarget(a.killTarget);
    return hostInLobby(s, a.by) && killTarget !== null && killTarget !== s.settings.killTarget ? { ...s, settings: { ...s.settings, killTarget } } : s;
  },
  setFog(s, a) {
    return hostInLobby(s, a.by) && typeof a.fog === 'boolean' && a.fog !== s.settings.fog ? { ...s, settings: { ...s.settings, fog: a.fog } } : s;
  },
  startMatch: (s, a) => (s.host === a.by && canStart(s) ? { ...s, phase: { kind: 'in-match' }, matchesStarted: s.matchesStarted + 1 } : s),
  endMatch: (s, a) => (s.host === a.by && s.phase.kind === 'in-match' ? { ...s, phase: { kind: 'lobby' } } : s),
};

/** The one way a room changes. An action that is not allowed, or not understood, returns `state` itself. */
export function reduce(state: RoomState, action: RoomAction): RoomState {
  const handler = Object.hasOwn(HANDLERS, action.kind) ? (HANDLERS[action.kind] as (s: RoomState, a: RoomAction) => RoomState) : undefined;
  return handler === undefined ? state : handler(state, action);
}
