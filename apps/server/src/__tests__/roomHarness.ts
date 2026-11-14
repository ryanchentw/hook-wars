import type { ClientMessageOf, LobbyAction, ServerMessage, ServerMessageOf } from '@hookbrawl/protocol';
import { DEFAULT_SETTINGS, type MemberId, type PlayerName } from '@hookbrawl/room';
import { advance, createRoomCore, disconnect, input, join, leave, lobbyAction, rejoin, type Outbound, type Room, type RoomRules, type Step } from '../rooms/core';

export const TICK_MS = 1000 / 30;

export const RULES: RoomRules = {
  tickMs: TICK_MS,
  snapshotHz: 20,
  rejoinWindowMs: 60_000,
  emptyRoomGraceMs: 30_000,
  countdownMs: 1000,
  maxCatchUpTicks: 5,
  inputBufferMax: 1,
  inputQueueMax: 32,
};

/** A room on a clock the test moves by hand, keeping everything it sent. */
export function harness(rules: RoomRules = RULES) {
  let now = 0;
  let tokens = 0;
  let room: Room = createRoomCore('ABCDEF', now);
  let sent: Outbound[] = [];
  const entropy = { token: () => `token-${(tokens += 1)}`.padEnd(32, 'x'), seed: () => 42 };
  const take = (step: Step): void => {
    room = step.room;
    sent = [...sent, ...step.out];
  };

  const api = {
    rules,
    get room() {
      return room;
    },
    get now() {
      return now;
    },
    join(name: string): MemberId {
      const seated = join(room, name as PlayerName, now, entropy);
      if (!seated.ok) throw new Error(`join refused: ${seated.code}`);
      take(seated.step);
      return seated.member;
    },
    tryJoin: (name: string) => join(room, name as PlayerName, now, entropy),
    rejoin(token: string) {
      const seated = rejoin(room, token, now);
      if (seated.ok) take(seated.step);
      return seated;
    },
    disconnect: (member: MemberId) => take(disconnect(room, member, now)),
    leave: (member: MemberId) => take(leave(room, member, now)),
    act: (member: MemberId, action: LobbyAction) => take(lobbyAction(room, member, action, now, rules, entropy)),
    input: (member: MemberId, message: Omit<ClientMessageOf<'input'>, 't'>) => take(input(room, member, { t: 'input', ...message }, now, rules)),
    /** Moves the clock on in steps of `stepMs`, waking the room at each as its timer would. */
    run(ms: number, stepMs: number = TICK_MS): void {
      const end = now + ms;
      while (now < end - 1e-6) {
        now = Math.min(end, now + stepMs);
        take(advance(room, now, rules));
      }
    },
    /** Jumps the clock without waking the room in between, as a stalled process would. */
    stall(ms: number): void {
      now += ms;
      take(advance(room, now, rules));
    },
    sentTo<T extends ServerMessage['t']>(member: MemberId, t: T): ServerMessageOf<T>[] {
      return sent.flatMap((o) => (o.kind === 'send' && o.to === member && o.message.t === t ? [o.message as ServerMessageOf<T>] : []));
    },
    last<T extends ServerMessage['t']>(member: MemberId, t: T): ServerMessageOf<T> {
      const message = api.sentTo(member, t).at(-1);
      if (message === undefined) throw new Error(`${member} was never sent a ${t}`);
      return message;
    },
    forget: () => {
      sent = [];
    },
    tokenOf: (member: MemberId): string => api.last(member, 'welcome').token,
  };
  return api;
}

/** Two members seated, one a side, with the first of them hosting. */
export function duel(rules: RoomRules = RULES, fog = DEFAULT_SETTINGS.fog) {
  const h = harness(rules);
  const west = h.join('Ada');
  const east = h.join('Bo');
  if (fog !== h.room.lobby.settings.fog) h.act(west, { kind: 'setFog', fog });
  return { h, west, east };
}

export function started(rules: RoomRules = RULES, fog = DEFAULT_SETTINGS.fog) {
  const game = duel(rules, fog);
  game.h.act(game.west, { kind: 'startMatch' });
  // A millisecond past the start, so each further step of one tick lands just after a tick comes due and never just before.
  game.h.run(rules.countdownMs + 1);
  return game;
}
