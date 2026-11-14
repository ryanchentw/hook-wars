import { parseName } from '@hookbrawl/room';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Invite } from '../app/onlineMode';
import { parseRoomCode } from '../app/roomAddress';
import { CreditsLink } from '../hud/labels';
import { Notice } from '../screens/Notice';

type Props = {
  readonly name: string;
  readonly notice: string | null;
  /** A room to offer: joining it becomes the main thing to do. */
  readonly invite: Invite | null;
  /** A room has been asked for and the server has not answered yet. */
  readonly connecting: boolean;
  /** Each returns why the name was refused, or null once the player is on their way. */
  readonly onPlay: (name: string) => string | null;
  readonly onCreate: (name: string) => string | null;
  readonly onJoin: (name: string, code: string) => string | null;
};

const BAD_CODE = 'Enter the room code: six letters and digits.';

type JoinProps = { readonly invite: string | null; readonly connecting: boolean; readonly onJoin: (code: string) => void; readonly button: React.RefObject<HTMLButtonElement | null> };

/** The code is checked when Join is pressed, never while it is typed, and the error goes as soon as the code is one. */
function JoinForm({ invite, connecting, onJoin, button }: JoinProps) {
  const [code, setCode] = useState(invite ?? '');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const ids = { field: useId(), hint: useId(), error: useId() };

  useEffect(() => {
    if (invite !== null) setCode(invite);
  }, [invite]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const parsed = parseRoomCode(code);
    setError(parsed === null ? BAD_CODE : null);
    if (parsed === null) return input.current?.focus();
    onJoin(parsed);
  };

  return (
    <form className="menu-join" onSubmit={submit} noValidate>
      <label htmlFor={ids.field} className="field-label">
        Room code
      </label>
      <span id={ids.hint} className="field-hint">
        Six letters and digits, from whoever made the room
      </span>
      <div className="menu-join-row">
        <input
          ref={input}
          id={ids.field}
          className="field-input room-code-input"
          value={code}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={error === null ? ids.hint : `${ids.hint} ${ids.error}`}
          onChange={(e) => {
            setCode(e.target.value);
            if (error !== null && parseRoomCode(e.target.value) !== null) setError(null);
          }}
        />
        <button ref={button} type="submit" className={invite === null ? 'hud-button' : 'hud-primary'} disabled={connecting}>
          Join room
        </button>
      </div>
      <p id={ids.error} className="field-error" hidden={error === null}>
        <span aria-hidden="true">✕ </span>
        {error}
      </p>
    </form>
  );
}

/** Title, name, and the three ways in. The name is checked once the player leaves the field or presses a way in, never while typing. */
export function MainMenu({ name, notice, invite, connecting, onPlay, onCreate, onJoin }: Props) {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const play = useRef<HTMLButtonElement>(null);
  const join = useRef<HTMLButtonElement>(null);
  const ids = { hint: useId(), error: useId(), title: useId(), online: useId() };

  useEffect(() => {
    const ready = invite === null ? play.current : join.current;
    (parseName(name).ok ? ready : input.current)?.focus();
  }, [name, invite]);

  const check = (value: string): string | null => {
    const parsed = parseName(value);
    return parsed.ok ? null : parsed.error;
  };
  /** Goes in by `enter` under the name as typed; a refused name is said beside the field, which takes focus. */
  const go = (enter: (name: string) => string | null): void => {
    const refused = enter(draft);
    setError(refused);
    if (refused !== null) input.current?.focus();
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    go(onPlay);
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
          <button ref={play} type="submit" className={invite === null ? 'hud-primary' : 'hud-button'}>
            Play offline
          </button>
        </form>
        <section className="menu-online" aria-labelledby={ids.online}>
          <h2 id={ids.online} className="menu-online-title">
            With friends
          </h2>
          {invite !== null && <p className="menu-invite">{invite.why === 'link' ? `You have been invited to room ${invite.code}.` : `Join room ${invite.code} to get back in.`}</p>}
          <JoinForm invite={invite?.code ?? null} connecting={connecting} button={join} onJoin={(code) => go((typed) => onJoin(typed, code))} />
          <button type="button" className="hud-button menu-create" disabled={connecting} onClick={() => go(onCreate)}>
            Create a room
          </button>
        </section>
        <Notice text={notice} />
        <div className="menu-links">
          <CreditsLink />
        </div>
      </div>
    </main>
  );
}
