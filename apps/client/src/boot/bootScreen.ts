import './boot.css';

export type BootScreen = {
  /** `fraction` runs 0..1. */
  showLoading(fraction: number): void;
  showError(message: string, onRetry: () => void): void;
  /** A message with nothing for the player to do but wait. */
  showNotice(message: string): void;
  hide(): void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/** The panel shown instead of the match while models download, and when something stops the game from drawing. */
export function createBootScreen(root: HTMLElement): BootScreen {
  const panel = el('div', 'boot-panel hud-plate');
  const title = el('h1', 'boot-title', 'Hook Wars');
  const status = el('p', 'boot-status');
  status.setAttribute('role', 'status');
  const track = el('div', 'boot-track');
  const bar = el('div', 'boot-bar');
  track.append(bar);
  const error = el('p', 'boot-error');
  error.setAttribute('role', 'alert');
  const retry = el('button', 'hud-button boot-retry', 'Try again');
  retry.type = 'button';
  panel.append(title, status, track, error, retry);
  root.append(panel);
  let onRetry: (() => void) | null = null;
  retry.addEventListener('click', () => onRetry?.());

  const show = (mode: 'loading' | 'error' | 'notice'): void => {
    root.hidden = false;
    root.dataset.mode = mode;
    track.hidden = mode !== 'loading';
    status.hidden = mode === 'error';
    error.hidden = mode !== 'error';
    retry.hidden = mode !== 'error';
  };

  return {
    showLoading(fraction) {
      const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
      status.textContent = `Rigging the harbour… ${pct}%`;
      bar.style.width = `${pct}%`;
      show('loading');
    },
    showError(message, retryWith) {
      error.textContent = message;
      onRetry = retryWith;
      show('error');
      retry.focus();
    },
    showNotice(message) {
      status.textContent = message;
      show('notice');
    },
    hide() {
      root.hidden = true;
    },
  };
}
