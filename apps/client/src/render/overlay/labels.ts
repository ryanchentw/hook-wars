import type { PlayerId, TeamId, Vec2 } from '@hookwars/sim';
import { hpLevel } from '../../game/health';
import { startLoss, stepLoss, type HpLoss } from './hpLoss';

export type LabelView = {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: TeamId;
  readonly hpFraction: number;
  /** 0..1: fades the label with its fighter as they come into or leave sight. */
  readonly presence: number;
  /** CSS pixels from the overlay's top-left corner, or null to hide the label. */
  readonly anchor: Vec2 | null;
  /** What the fighter just said, shown above the name, or null. */
  readonly bubble: string | null;
  /** CSS pixels the bubble is slid sideways to stay on screen when its fighter is near an edge. */
  readonly bubbleShift: number;
};

export type Labels = {
  update(views: readonly LabelView[], dt: number): void;
  /** CSS pixels the label took when last shown, or null before it has been shown with its current name. */
  widthOf(id: PlayerId): number | null;
  clear(): void;
};

type Entry = {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly fill: HTMLElement;
  readonly lost: HTMLElement;
  readonly bubble: HTMLElement;
  readonly loss: HpLoss;
  readonly width: number | null;
};

const percent = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function createEntry(parent: HTMLElement, view: LabelView): Entry {
  const root = document.createElement('div');
  root.className = `unit-label unit-${view.team}`;
  const name = document.createElement('span');
  name.className = 'unit-name';
  name.textContent = view.name;
  const bar = document.createElement('div');
  bar.className = 'unit-hp';
  // Behind the fill: the part of it that sticks out is the chunk a blow has just taken.
  const lost = document.createElement('div');
  lost.className = 'unit-hp-lost';
  const fill = document.createElement('div');
  fill.className = 'unit-hp-fill';
  bar.append(lost, fill);
  // Placed out of the label's flow, so a bubble coming and going never moves the name or changes the label's width.
  const bubble = document.createElement('p');
  bubble.className = 'unit-bubble';
  bubble.hidden = true;
  root.append(bubble, name, bar);
  parent.append(root);
  return { root, name, fill, lost, bubble, loss: startLoss(clamp01(view.hpFraction)), width: null };
}

/** A name can change mid-match, as when a bot takes over a fighter; the width is measured again once it is on screen. */
function renamed(entry: Entry, name: string): Entry {
  if (entry.name.textContent === name) return entry;
  entry.name.textContent = name;
  return { ...entry, width: null };
}

const measured = (entry: Entry): Entry => (entry.width !== null || entry.root.hidden ? entry : { ...entry, width: entry.root.offsetWidth });

/** Text only, through `textContent`: whatever a player typed is shown as the characters they typed. */
function say(entry: Entry, view: LabelView): void {
  const text = view.bubble ?? '';
  if (entry.bubble.textContent !== text) entry.bubble.textContent = text;
  entry.bubble.hidden = view.bubble === null;
  if (view.bubble !== null) entry.bubble.style.setProperty('--bubble-shift', `${view.bubbleShift.toFixed(1)}px`);
}

/** Name and hp bar floating over each character, as DOM so the text stays crisp at any zoom. */
export function createLabels(parent: HTMLElement): Labels {
  let entries = new Map<PlayerId, Entry>();

  return {
    update(views, dt) {
      const next = new Map<PlayerId, Entry>();
      for (const view of views) {
        const known = entries.get(view.id);
        const entry = known === undefined ? createEntry(parent, view) : renamed(known, view.name);
        const fraction = clamp01(view.hpFraction);
        const loss = stepLoss(entry.loss, fraction, dt);
        entry.root.hidden = view.anchor === null || view.presence <= 0;
        entry.root.style.opacity = view.presence < 1 ? view.presence.toFixed(2) : '';
        if (view.anchor !== null) {
          entry.root.style.transform = `translate(${view.anchor.x.toFixed(1)}px, ${view.anchor.y.toFixed(1)}px) translate(-50%, -100%)`;
        }
        say(entry, view);
        entry.fill.style.width = percent(fraction);
        entry.fill.dataset.level = hpLevel(fraction);
        if (loss !== entry.loss) entry.lost.style.width = percent(loss.shown);
        next.set(view.id, measured(loss === entry.loss ? entry : { ...entry, loss }));
      }
      entries.forEach((entry, id) => {
        if (!next.has(id)) entry.root.remove();
      });
      entries = next;
    },
    widthOf: (id) => entries.get(id)?.width ?? null,
    clear() {
      entries.forEach((entry) => entry.root.remove());
      entries = new Map();
    },
  };
}
