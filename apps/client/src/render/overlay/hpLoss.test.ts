import { describe, expect, it } from 'vitest';
import { HP_LOSS, startLoss, stepLoss, type HpLoss } from './hpLoss';

const FRAME = 1 / 60;
const run = (loss: HpLoss, hp: number, seconds: number): HpLoss => {
  let current = loss;
  for (let t = 0; t < seconds; t += FRAME) current = stepLoss(current, hp, FRAME);
  return current;
};

describe('hp lost chunk', () => {
  it('shows nothing lost on a bar that has not changed, and makes no new state for it', () => {
    const full = startLoss(1);
    expect(full.shown).toBe(1);
    expect(stepLoss(full, 1, FRAME)).toBe(full);
  });

  it('keeps the old amount on show for a moment after a blow', () => {
    const struck = stepLoss(startLoss(1), 0.9, FRAME);
    expect(struck.shown).toBe(1);
    expect(run(struck, 0.9, HP_LOSS.hold * 0.8).shown).toBe(1);
  });

  it('then drains down to the true amount and stops exactly there', () => {
    const struck = stepLoss(startLoss(1), 0.9, FRAME);
    const draining = run(struck, 0.9, HP_LOSS.hold + 0.05);
    expect(draining.shown).toBeLessThan(1);
    expect(draining.shown).toBeGreaterThan(0.9);
    const settled = run(struck, 0.9, 0.65);
    expect(settled.shown).toBe(0.9);
    expect(stepLoss(settled, 0.9, FRAME)).toBe(settled);
  });

  it('is settled again before the next melee blow from the same brawler', () => {
    const chunk = 110 / 1500;
    expect(HP_LOSS.hold + chunk / HP_LOSS.drainPerSecond).toBeLessThan(0.7);
  });

  it('holds again when a second blow lands while the first chunk is still draining', () => {
    const first = run(stepLoss(startLoss(1), 0.9, FRAME), 0.9, HP_LOSS.hold + 0.03);
    const second = stepLoss(first, 0.8, FRAME);
    expect(second.shown).toBe(first.shown);
    expect(stepLoss(second, 0.8, FRAME).shown).toBe(first.shown);
  });

  it('snaps up with the bar when hp comes back, as on a respawn', () => {
    const dead = run(stepLoss(startLoss(1), 0, FRAME), 0, 0.1);
    expect(stepLoss(dead, 1, FRAME)).toMatchObject({ hp: 1, shown: 1 });
  });
});
