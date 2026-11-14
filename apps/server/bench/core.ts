import { encodeServerMessage, type Act, type LobbyAction } from '@hookbrawl/protocol';
import type { MemberId, PlayerName } from '@hookbrawl/room';
import { botThink, createBotBrain, type BotBrain, type PlayerInput } from '@hookbrawl/sim';
import { advance, createRoomCore, input, join, lobbyAction, type Room, type RoomRules, type Step } from '../src/rooms/core';

/**
 * One 3v3 room run in this process with no sockets: six members, each played by the sim's bot through the same
 * inputs a browser sends, so the room does all the work it does for six real players. Prints the time one tick
 * takes and the size of what each client is sent, with the fog off and on.
 *
 * Run: pnpm --filter @hookbrawl/server exec tsx bench/core.ts
 */
const TICK_MS = 1000 / 30;
const MATCH_SECONDS = 120;
const WARM_UP_TICKS = 300;
const RULES: RoomRules = { tickMs: TICK_MS, snapshotHz: 20, rejoinWindowMs: 60_000, emptyRoomGraceMs: 30_000, countdownMs: 0, maxCatchUpTicks: 5, inputBufferMax: 1, inputQueueMax: 32 };
const NAMES = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo'];

type Player = { readonly member: MemberId; brain: BotBrain; seq: number };

const quantile = (sorted: readonly number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
const mean = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);

function toAct(thought: PlayerInput): Act | null {
  if (thought.kind === 'buy') return { kind: 'buy', purchase: thought.purchase };
  if (thought.kind === 'hook' || thought.kind === 'grapple' || thought.kind === 'move') return { kind: thought.kind, target: thought.target };
  return null;
}

function setUp(fog: boolean): { room: Room; players: Player[] } {
  let seed = 1;
  let token = 0;
  const entropy = { token: () => `t${(token += 1)}`.padEnd(32, 'x'), seed: () => (seed += 7) };
  let room = createRoomCore('BENCH2', 0);
  const players = NAMES.map((name, i): Player => {
    const seated = join(room, name as PlayerName, 0, entropy);
    if (!seated.ok) throw new Error(`join refused: ${seated.code}`);
    room = seated.step.room;
    return { member: seated.member, brain: createBotBrain(100 + i), seq: 0 };
  });
  const host = players[0]!.member;
  const actions: LobbyAction[] = [{ kind: 'setFog', fog }, { kind: 'setKillTarget', killTarget: 20 }, { kind: 'startMatch' }];
  actions.forEach((action) => (room = lobbyAction(room, host, action, 0, RULES, entropy).room));
  return { room, players };
}

/** Each member's bot looks at the match and sends what it decides, as one input message. */
function play(room: Room, players: Player[], now: number): Room {
  const { match } = room;
  if (match === null) return room;
  return players.reduce((current, player) => {
    const fighter = match.fighters.find((f) => f.owner === player.member);
    if (fighter === undefined) return current;
    const thought = botThink(match.state, fighter.id, player.brain);
    player.brain = thought.brain;
    const acts = thought.inputs.flatMap((i) => toAct(i) ?? []).slice(0, 4);
    if (acts.length === 0) return current;
    player.seq += 1;
    return input(current, player.member, { t: 'input', seq: player.seq, steer: { x: 0, y: 0 }, acts }, now, RULES).room;
  }, room);
}

function run(fog: boolean): void {
  let { room, players } = setUp(fog);
  const tickMs: number[] = [];
  const encodeMs: number[] = [];
  const snapBytes: number[] = [];
  let matches = 1;
  let kills = 0;
  let hooks = 0;
  const ticks = MATCH_SECONDS * 30;
  for (let i = 1; i <= ticks + WARM_UP_TICKS; i += 1) {
    const now = i * TICK_MS + 1;
    room = play(room, players, now);
    const started = performance.now();
    const step: Step = advance(room, now, RULES);
    const stepped = performance.now();
    const frames = step.out.flatMap((o) => (o.kind === 'send' && o.message.t === 'snap' ? [encodeServerMessage(o.message)] : []));
    const encoded = performance.now();
    room = step.room;
    // Counted to show the ticks timed were a fight and not six fighters standing still.
    kills += room.match?.state.events.filter((e) => e.kind === 'kill').length ?? 0;
    hooks += room.match?.state.events.filter((e) => e.kind === 'hookCast').length ?? 0;
    if (room.match === null) {
      // The match ended inside the window: start the next, so the numbers are all from play.
      room = lobbyAction(room, room.lobby.host!, { kind: 'startMatch' }, now, RULES, { token: () => '', seed: () => 1000 + matches }).room;
      matches += 1;
      players.forEach((p) => (p.seq = 0));
    }
    if (i <= WARM_UP_TICKS) continue;
    tickMs.push(stepped - started);
    encodeMs.push(encoded - stepped);
    frames.forEach((frame) => snapBytes.push(Buffer.byteLength(frame)));
  }
  const sorted = [...tickMs].sort((a, b) => a - b);
  const sizes = [...snapBytes].sort((a, b) => a - b);
  const perClientPerSecond = snapBytes.reduce((sum, b) => sum + b, 0) / NAMES.length / MATCH_SECONDS;
  const line = {
    fog,
    ticks,
    matches,
    kills,
    hooksCast: hooks,
    tickMs: { mean: +mean(tickMs).toFixed(3), p50: +quantile(sorted, 0.5).toFixed(3), p99: +quantile(sorted, 0.99).toFixed(3), max: +sorted.at(-1)!.toFixed(3) },
    encodeMsPerTick: +mean(encodeMs).toFixed(3),
    snapshotBytes: { mean: Math.round(mean(snapBytes)), p50: quantile(sizes, 0.5), max: sizes.at(-1) },
    jsonBytesPerSecondPerClient: Math.round(perClientPerSecond),
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

run(false);
run(true);
