import type { SceneLook } from '../scenes/types';
import './titleCard.css';

export type TitleCard = {
  /** Shows the place name at `opacity`; 0 hides it. */
  show(title: SceneLook['title'], opacity: number): void;
  remove(): void;
};

/** The place name over the establishing shot. Announced politely, once, so a screen reader hears where the match is. */
export function createTitleCard(parent: HTMLElement): TitleCard {
  const root = document.createElement('div');
  root.className = 'title-card';
  root.setAttribute('role', 'status');
  root.hidden = true;
  const name = document.createElement('p');
  name.className = 'title-card-name';
  const caption = document.createElement('p');
  caption.className = 'title-card-caption';
  const hint = document.createElement('p');
  hint.className = 'title-card-hint';
  hint.textContent = 'Press any key to skip';
  root.append(name, caption, hint);
  parent.append(root);

  return {
    show(title, opacity) {
      root.hidden = opacity <= 0;
      if (root.hidden) return;
      if (name.textContent !== title.name) name.textContent = title.name;
      if (caption.textContent !== title.caption) caption.textContent = title.caption;
      root.style.opacity = opacity.toFixed(3);
    },
    remove: () => root.remove(),
  };
}
