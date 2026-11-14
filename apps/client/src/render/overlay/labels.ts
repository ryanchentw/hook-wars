import type { PlayerId, TeamId, Vec2 } from '@hookbrawl/sim';
import { hpLevel } from '../../game/health';

export type LabelView = {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: TeamId;
  readonly hpFraction: number;
  /** CSS pixels from the overlay's top-left corner, or null to hide the label. */
  readonly anchor: Vec2 | null;
};

export type Labels = { update(views: readonly LabelView[]): void; clear(): void };

type Entry = { readonly root: HTMLElement; readonly fill: HTMLElement };

function createEntry(parent: HTMLElement, view: LabelView): Entry {
  const root = document.createElement('div');
  root.className = `unit-label unit-${view.team}`;
  const name = document.createElement('span');
  name.className = 'unit-name';
  name.textContent = view.name;
  const bar = document.createElement('div');
  bar.className = 'unit-hp';
  const fill = document.createElement('div');
  fill.className = 'unit-hp-fill';
  bar.append(fill);
  root.append(name, bar);
  parent.append(root);
  return { root, fill };
}

/** Name and hp bar floating over each character, as DOM so the text stays crisp at any zoom. */
export function createLabels(parent: HTMLElement): Labels {
  let entries = new Map<PlayerId, Entry>();

  return {
    update(views) {
      const next = new Map<PlayerId, Entry>();
      for (const view of views) {
        const entry = entries.get(view.id) ?? createEntry(parent, view);
        const fraction = Math.min(1, Math.max(0, view.hpFraction));
        entry.root.hidden = view.anchor === null;
        if (view.anchor !== null) {
          entry.root.style.transform = `translate(${view.anchor.x.toFixed(1)}px, ${view.anchor.y.toFixed(1)}px) translate(-50%, -100%)`;
        }
        entry.fill.style.width = `${(fraction * 100).toFixed(1)}%`;
        entry.fill.dataset.level = hpLevel(fraction);
        next.set(view.id, entry);
      }
      entries.forEach((entry, id) => {
        if (!next.has(id)) entry.root.remove();
      });
      entries = next;
    },
    clear() {
      entries.forEach((entry) => entry.root.remove());
      entries = new Map();
    },
  };
}
