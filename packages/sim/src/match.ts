import { facingCanal, spawnPoint, TEAMS } from './arena';
import { DEFAULT_ARENA, TUNING } from './config';
import { IDLE } from './intent';
import type { Arena, GameState, MatchConfig, MatchPlayerConfig, Player } from './types';

function validate(config: MatchConfig, arena: Arena): void {
  if (!Number.isFinite(config.killTarget) || config.killTarget < 1) {
    throw new Error(`killTarget must be at least 1, got ${config.killTarget}`);
  }
  TEAMS.forEach((team) => {
    const count = config.players.filter((p) => p.team === team).length;
    const max = arena.spawns[team].length;
    if (count < 1) throw new Error(`team ${team} needs at least one player`);
    if (count > max) throw new Error(`team ${team} has ${count} players but only ${max} spawns`);
  });
  const seen = new Set<string>();
  config.players.forEach(({ id }) => {
    if (seen.has(id)) throw new Error(`duplicate player id ${id}`);
    seen.add(id);
  });
}

function spawnPlayer(arena: Arena, cfg: MatchPlayerConfig, spawnIndex: number): Player {
  return {
    ...cfg,
    spawnIndex,
    pos: spawnPoint(arena, cfg.team, spawnIndex),
    facing: facingCanal(cfg.team),
    move: IDLE,
    hp: TUNING.maxHp,
    status: { kind: 'alive' },
    hookReadyAt: 0,
    meleeReadyAt: 0,
    kills: 0,
    deaths: 0,
  };
}

export function createMatch(config: MatchConfig): GameState {
  const arena = config.arena ?? DEFAULT_ARENA;
  validate(config, arena);
  const players = config.players.map((cfg, i) =>
    spawnPlayer(arena, cfg, config.players.slice(0, i).filter((p) => p.team === cfg.team).length),
  );
  return {
    tick: 0,
    time: 0,
    arena,
    players,
    hooks: [],
    score: { west: 0, east: 0 },
    killTarget: config.killTarget,
    phase: { kind: 'playing' },
    nextHookSeq: 0,
    events: [],
  };
}
