/** The page events audio listens to. Each binder returns its unbinder. */

type Target = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

function listen<E extends Event>(target: Target, type: string, handler: (event: E) => void, capture = false): () => void {
  const wrapped = (event: Event): void => handler(event as E);
  target.addEventListener(type, wrapped, capture);
  return () => target.removeEventListener(type, wrapped, capture);
}

/** Browsers let audio start only from a gesture; every key and press asks again, since some suspend it later. */
export function bindGestures(win: Target, onGesture: () => void): () => void {
  const unbinders = ['pointerdown', 'keydown', 'touchend'].map((type) => listen(win, type, onGesture, true));
  return () => unbinders.forEach((unbind) => unbind());
}

export function bindVisibility(doc: Document, onChange: (hidden: boolean) => void): () => void {
  return listen(doc, 'visibilitychange', () => onChange(doc.hidden));
}

/** Whether a key pressed here is someone typing. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'submit'].includes(target.type);
}

/** `M` on any screen; never while typing in a field or with a modifier held. */
export function bindMuteKey(win: Target, toggle: () => void): () => void {
  return listen<KeyboardEvent>(win, 'keydown', (event) => {
    if (event.code !== 'KeyM' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (typing(event.target)) return;
    toggle();
  });
}

/** A press on any button `counts` says should click. */
export function bindButtonClicks(doc: Document, counts: (button: HTMLButtonElement) => boolean, onClick: () => void): () => void {
  return listen<MouseEvent>(doc, 'click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (button !== null && !button.disabled && counts(button)) onClick();
  });
}

/** Runs `job` once the page has loaded and the browser is idle, so nothing it fetches competes with the first paint. */
export function whenIdle(win: Window, job: () => void): void {
  // Safari shipped requestIdleCallback late.
  const onIdle = (win as Partial<Pick<Window, 'requestIdleCallback'>>).requestIdleCallback?.bind(win);
  const idle = (): void => void (onIdle === undefined ? win.setTimeout(job, 0) : onIdle(() => job()));
  if (win.document.readyState === 'complete') idle();
  else win.addEventListener('load', idle, { once: true });
}
