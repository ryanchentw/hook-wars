import { botThink, createBotBrain, createMatch, step, TICK_DT, type BotBrain, type GameEvent, type GameState, type PickupKind, type PlayerId, type TeamId } from '@hookwars/sim';

/**
 * 3v3 bot matches straight on the sim, with river pickups on and off over the same seeds, to show the pickups leave
 * matches neither stalled nor lopsided. Prints one line per match and a mean per setting.
 *
 * Run: pnpm --filter @hookwars/server exec tsx bench/pickups.ts
 */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const KILL_TARGET = 10;
const MAX_SECONDS = 900;
const TEAMS: readonly TeamId[] = ['west', 'east'];

type Tally = { seconds: number; kills: number; collected: Record<PickupKind, number>; spawned: number; stormDeaths: number; winner: string };

function roster() {
  return TEAMS.flatMap((team) => [0, 1, 2].map((i) => ({ id: `${team}-${i}` as PlayerId, name: `${team}${i}`, team, isBot: true })));
}

/** A kill is Storm's when the last damaging blow on the victim that step was a Storm pulse. */
function stormKills(events: readonly GameEvent[]): number {
  return events.filter((e) => e.kind === 'kill').filter((kill) => {
    const blows = events.filter((e) => (e.kind === 'storm' || e.kind === 'melee' || (e.kind === 'hookHit' && e.damage > 0)) && e.targetId === kill.victimId);
    return blows.at(-1)?.kind === 'storm';
  }).length;
}

function play(seed: number, pickups: boolean): Tally {
  let state: GameState = createMatch({ killTarget: KILL_TARGET, fog: true, pickups, seed, players: roster() });
  let brains = new Map<PlayerId, BotBrain>(state.players.map((p, i) => [p.id, createBotBrain(seed * 31 + i)]));
  const tally: Tally = { seconds: 0, kills: 0, collected: { gold: 0, gale: 0, storm: 0 }, spawned: 0, stormDeaths: 0, winner: '-' };
  for (let i = 0; i < MAX_SECONDS / TICK_DT && state.phase.kind === 'playing'; i++) {
    const thoughts = state.players.map((p) => ({ id: p.id, ...botThink(state, p.id, brains.get(p.id)!) }));
    brains = new Map(thoughts.map((x) => [x.id, x.brain]));
    state = step(state, thoughts.flatMap((x) => x.inputs), TICK_DT);
    tally.spawned = state.nextPickupSeq;
    tally.kills += state.events.filter((e) => e.kind === 'kill').length;
    tally.stormDeaths += stormKills(state.events);
    state.events.forEach((e) => {
      if (e.kind === 'pickupCollected') tally.collected[e.pickupKind] += 1;
    });
  }
  tally.seconds = state.time;
  tally.winner = state.phase.kind === 'ended' ? `${state.phase.winner} ${state.score.west}-${state.score.east}` : `unfinished ${state.score.west}-${state.score.east}`;
  return tally;
}

const fmt = (t: Tally): string =>
  `${t.seconds.toFixed(0).padStart(4)}s  kills ${String(t.kills).padStart(3)}  sent ${String(t.spawned).padStart(2)}  gold ${t.collected.gold} gale ${t.collected.gale} storm ${t.collected.storm}  storm deaths ${t.stormDeaths}  ${t.winner}`;

for (const pickups of [false, true]) {
  const runs = SEEDS.map((seed) => ({ seed, tally: play(seed, pickups) }));
  process.stdout.write(`pickups ${pickups ? 'on' : 'off'}\n`);
  runs.forEach(({ seed, tally }) => process.stdout.write(`  seed ${seed}  ${fmt(tally)}\n`));
  const mean = (pick: (t: Tally) => number): string => (runs.reduce((s, r) => s + pick(r.tally), 0) / runs.length).toFixed(1);
  process.stdout.write(`  mean  ${mean((t) => t.seconds)}s  kills ${mean((t) => t.kills)}  collected ${mean((t) => t.collected.gold + t.collected.gale + t.collected.storm)}  storm deaths ${mean((t) => t.stormDeaths)}\n`);
}
