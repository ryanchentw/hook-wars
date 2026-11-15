import { parseName } from '@hookwars/room';
import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';

/** Each way in returns why the name was refused, or null once the player is on their way. */
export type Enter = (name: string) => string | null;

export type NameState = {
  readonly draft: string;
  readonly error: string | null;
  readonly input: RefObject<HTMLInputElement | null>;
  readonly change: (value: string) => void;
  readonly blur: () => void;
  /** Goes in under the name as typed; a refused name is said beside the field, which takes focus. */
  readonly go: (enter: Enter) => void;
};

const check = (value: string): string | null => {
  const parsed = parseName(value);
  return parsed.ok ? null : parsed.error;
};

/** The name is checked once the player leaves the field or presses a way in, never while typing. */
export function useName(initial: string): NameState {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return {
    draft,
    error,
    input,
    change: (value) => {
      setDraft(value);
      if (error !== null) setError(check(value));
    },
    blur: () => {
      if (draft !== '' || error !== null) setError(check(draft));
    },
    go: (enter) => {
      const refused = enter(draft);
      setError(refused);
      if (refused !== null) input.current?.focus();
    },
  };
}

/** A form of its own, so Enter here runs whatever the open tab's gold button does. */
export function NameField({ state, onEnter }: { readonly state: NameState; readonly onEnter: () => void }) {
  const ids = { field: useId(), hint: useId(), error: useId() };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    onEnter();
  };
  return (
    <form className="menu-name" onSubmit={submit} noValidate>
      <div className="menu-name-head">
        <label htmlFor={ids.field} className="field-label menu-name-label">
          Your name
        </label>
        <span id={ids.hint} className="field-hint">
          1 to 16 characters
        </span>
      </div>
      <input
        ref={state.input}
        id={ids.field}
        className="field-input menu-name-input"
        value={state.draft}
        autoComplete="nickname"
        spellCheck={false}
        enterKeyHint="go"
        aria-invalid={state.error !== null}
        aria-describedby={state.error === null ? ids.hint : `${ids.hint} ${ids.error}`}
        onChange={(e) => state.change(e.target.value)}
        onBlur={state.blur}
      />
      <p id={ids.error} className="field-error" hidden={state.error === null}>
        <span aria-hidden="true">✕ </span>
        {state.error}
      </p>
    </form>
  );
}
