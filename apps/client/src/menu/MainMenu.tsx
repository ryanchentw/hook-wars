import { parseName } from '@hookbrawl/room';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CreditsLink } from '../hud/labels';
import { Notice } from '../screens/Notice';

type Props = {
  readonly name: string;
  readonly notice: string | null;
  /** Returns why the name was refused, or null once the player is on their way to the lobby. */
  readonly onPlay: (name: string) => string | null;
};

/** Title, name and Play. The name is checked once the player leaves the field or presses Play, never while typing. */
export function MainMenu({ name, notice, onPlay }: Props) {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const play = useRef<HTMLButtonElement>(null);
  const ids = { hint: useId(), error: useId(), title: useId() };

  useEffect(() => {
    (parseName(name).ok ? play.current : input.current)?.focus();
  }, [name]);

  const check = (value: string): string | null => {
    const parsed = parseName(value);
    return parsed.ok ? null : parsed.error;
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const refused = onPlay(draft);
    setError(refused);
    if (refused !== null) input.current?.focus();
  };

  return (
    <main className="screen menu" aria-labelledby={ids.title}>
      <div className="screen-panel hud-plate menu-panel">
        <h1 id={ids.title} className="menu-title">
          Hook Brawl
        </h1>
        <p className="menu-tagline">A hook duel across the water</p>
        <form className="menu-form" onSubmit={submit} noValidate>
          <label htmlFor={ids.hint + 'name'} className="field-label">
            Your name
          </label>
          <span id={ids.hint} className="field-hint">
            1 to 16 characters
          </span>
          <input
            ref={input}
            id={ids.hint + 'name'}
            className="field-input"
            value={draft}
            autoComplete="nickname"
            spellCheck={false}
            aria-invalid={error !== null}
            aria-describedby={error === null ? ids.hint : `${ids.hint} ${ids.error}`}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error !== null) setError(check(e.target.value));
            }}
            onBlur={() => {
              if (draft !== '' || error !== null) setError(check(draft));
            }}
          />
          <p id={ids.error} className="field-error" hidden={error === null}>
            <span aria-hidden="true">✕ </span>
            {error}
          </p>
          <button ref={play} type="submit" className="hud-primary">
            Play
          </button>
        </form>
        <Notice text={notice} />
        <div className="menu-links">
          <CreditsLink />
        </div>
      </div>
    </main>
  );
}
