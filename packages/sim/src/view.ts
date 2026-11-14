import { normalize, sub } from './geometry';
import type { GameState, Grapple, Hook, MoveIntent, Player, PlayerCard, SeenGrapple, SeenPlayer, TeamId, TeamView } from './types';
import { seenEvents } from './viewEvents';
import { visibleTail, visibleTo, type Sight } from './vision';

/** Where an enemy walks to may lie in the dark; which way they walk is plain to see. */
function redactMove(move: MoveIntent, from: Player['pos']): MoveIntent {
  return move.kind === 'toward' ? { kind: 'steer', dir: normalize(sub(move.target, from)) } : move;
}

function seenPlayer(player: Player, fogged: boolean): SeenPlayer {
  if (!fogged) return player;
  const { gold: _gold, ...rest } = player;
  return { ...rest, move: redactMove(player.move, player.pos) };
}

function card(player: Player, goldShown: boolean): PlayerCard {
  const { id, name, team, isBot, kills, deaths, assists, gold } = player;
  return { id, name, team, isBot, kills, deaths, assists, gold: goldShown ? gold : null };
}

/** The chain as it lies now: from the thrower, through the bounces still in play, to the head. */
function chainOf(hook: Hook, owner: Player): readonly Player['pos'][] {
  const bounces = hook.phase.kind === 'extending' ? hook.path.slice(1) : [];
  return [owner.pos, ...bounces, hook.pos];
}

function seenHook(hook: Hook, owner: Player | undefined, sight: Sight): Hook {
  if (owner === undefined || owner.team === sight.viewer || sight.area.kind === 'everywhere') return hook;
  const chain = chainOf(hook, owner);
  const shown = sight.players.has(owner.id) ? chain : visibleTail(sight.area, chain);
  const path = shown.slice(0, -1);
  return { ...hook, path: path.length > 0 ? path : [hook.pos] };
}

function seenGrapple(grapple: Grapple, owner: Player | undefined, sight: Sight): SeenGrapple {
  if (owner === undefined || sight.players.has(owner.id)) return { ...grapple, ropeFrom: null };
  const [from] = visibleTail(sight.area, [owner.pos, grapple.pos]);
  return { ...grapple, ropeFrom: from ?? grapple.pos };
}

/**
 * The match as `team` is entitled to see it: what a server sends that team's clients, and all they need to draw.
 * Under open vision nothing is left out.
 */
export function viewFor(state: GameState, team: TeamId): TeamView {
  const sight = visibleTo(state, team);
  const fogged = sight.area.kind === 'circles';
  const byId = new Map(state.players.map((p) => [p.id, p]));
  return {
    viewer: team,
    tick: state.tick,
    time: state.time,
    arena: state.arena,
    vision: state.vision,
    score: state.score,
    killTarget: state.killTarget,
    phase: state.phase,
    players: state.players.filter((p) => sight.players.has(p.id)).map((p) => seenPlayer(p, fogged && p.team !== team)),
    roster: state.players.map((p) => card(p, !fogged || p.team === team)),
    hooks: state.hooks.filter((h) => sight.hooks.has(h.id)).map((h) => seenHook(h, byId.get(h.ownerId), sight)),
    grapples: state.grapples.filter((g) => sight.grapples.has(g.id)).map((g) => seenGrapple(g, byId.get(g.ownerId), sight)),
    events: seenEvents(state.events, sight, (id) => byId.get(id)?.team),
  };
}
