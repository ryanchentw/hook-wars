import { Container, Graphics, Text } from 'pixi.js';
import type { GameEvent, GameState, TeamId, Vec2 } from '@hookbrawl/sim';
import { COLORS, FONT_FAMILY, SIZES, TEAM_COLORS } from './theme';

export type EffectsView = {
  readonly container: Container;
  spawn(state: GameState): void;
  update(dt: number): void;
  clear(): void;
};

/** `progress` runs 0..1 over the effect's lifetime. */
type Effect = { readonly node: Container; readonly lifetime: number; readonly draw: (progress: number) => void; age: number };

function damageNumber(at: Vec2, amount: number): Effect {
  const text = new Text({
    text: `-${Math.round(amount)}`,
    style: { fontFamily: FONT_FAMILY, fontSize: SIZES.damageFontSize, fontWeight: '800', fill: COLORS.damageText, stroke: { color: COLORS.outline, width: 6 } },
  });
  text.anchor.set(0.5);
  return {
    node: text,
    lifetime: SIZES.damageLifetime,
    age: 0,
    draw(t) {
      text.position.set(at.x, at.y - 50 - SIZES.damageRise * t);
      text.alpha = 1 - t * t;
      text.scale.set(1 + 0.3 * (1 - t) * (1 - t));
    },
  };
}

function hitFlash(at: Vec2): Effect {
  const g = new Graphics();
  return {
    node: g,
    lifetime: SIZES.flashLifetime,
    age: 0,
    draw(t) {
      g.clear().circle(at.x, at.y, SIZES.flashRadius * (0.5 + t)).fill({ color: COLORS.flash, alpha: 0.7 * (1 - t) });
    },
  };
}

function bounceSpark(at: Vec2): Effect {
  const g = new Graphics();
  return {
    node: g,
    lifetime: SIZES.sparkLifetime,
    age: 0,
    draw(t) {
      g.clear();
      for (let i = 0; i < SIZES.sparkRays; i += 1) {
        const a = (i / SIZES.sparkRays) * Math.PI * 2;
        const r0 = SIZES.sparkLength * t;
        const r1 = r0 + SIZES.sparkLength * (1 - t);
        g.moveTo(at.x + Math.cos(a) * r0, at.y + Math.sin(a) * r0).lineTo(at.x + Math.cos(a) * r1, at.y + Math.sin(a) * r1);
      }
      g.stroke({ width: 5, color: COLORS.spark, alpha: 1 - t, cap: 'round' });
    },
  };
}

function killBurst(at: Vec2, team: TeamId | null): Effect {
  const g = new Graphics();
  const color = team === null ? COLORS.flash : TEAM_COLORS[team].light;
  return {
    node: g,
    lifetime: SIZES.killLifetime,
    age: 0,
    draw(t) {
      const ease = 1 - (1 - t) * (1 - t);
      g.clear();
      g.circle(at.x, at.y, SIZES.killRadius * ease).stroke({ width: 8 * (1 - t) + 1, color, alpha: 1 - t });
      for (let i = 0; i < SIZES.killParticles; i += 1) {
        const a = (i / SIZES.killParticles) * Math.PI * 2 + i;
        const r = SIZES.killRadius * ease * (0.6 + 0.4 * ((i * 0.618) % 1));
        g.circle(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r, 9 * (1 - t) + 1).fill({ color, alpha: 1 - t });
      }
    },
  };
}

function effectsFor(event: GameEvent, state: GameState): readonly Effect[] {
  switch (event.kind) {
    case 'hookHit':
      return event.damage > 0 ? [hitFlash(event.at), damageNumber(event.at, event.damage)] : [hitFlash(event.at)];
    case 'melee':
      return [damageNumber(event.at, event.damage)];
    case 'hookBounce':
      return [bounceSpark(event.at)];
    case 'kill': {
      const victim = state.players.find((p) => p.id === event.victimId);
      return [killBurst(event.at, victim?.team ?? null)];
    }
    case 'hookCast':
    case 'respawn':
    case 'matchEnd':
      return [];
  }
}

export function createEffectsView(): EffectsView {
  const container = new Container();
  let effects: readonly Effect[] = [];

  return {
    container,
    spawn(state) {
      const born = state.events.flatMap((e) => effectsFor(e, state));
      born.forEach((e) => {
        e.draw(0);
        container.addChild(e.node);
      });
      effects = [...effects, ...born];
    },
    update(dt) {
      effects.forEach((e) => {
        e.age += dt;
        if (e.age < e.lifetime) e.draw(e.age / e.lifetime);
        else e.node.destroy();
      });
      effects = effects.filter((e) => e.age < e.lifetime);
    },
    clear() {
      effects.forEach((e) => e.node.destroy());
      effects = [];
    },
  };
}
