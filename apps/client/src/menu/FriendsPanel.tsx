import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import type { Invite } from '../app/onlineMode';
import { parseRoomCode } from '../app/roomAddress';

const BAD_CODE = 'Enter the room code: six letters and digits.';

export type JoinCode = {
  readonly code: string;
  readonly error: string | null;
  readonly input: RefObject<HTMLInputElement | null>;
  readonly change: (value: string) => void;
  /** The code, tidied; or null, with the error shown and the field focused, when it is not one. */
  readonly check: () => string | null;
};

/** The code is checked when Join is pressed, never while it is typed, and the error goes as soon as the code is one. */
export function useJoinCode(invite: Invite | null): JoinCode {
  const [code, setCode] = useState(invite?.code ?? '');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (invite !== null) setCode(invite.code);
  }, [invite]);
  return {
    code,
    error,
    input,
    change: (value) => {
      setCode(value);
      if (error !== null && parseRoomCode(value) !== null) setError(null);
    },
    check: () => {
      const parsed = parseRoomCode(code);
      setError(parsed === null ? BAD_CODE : null);
      if (parsed === null) input.current?.focus();
      return parsed;
    },
  };
}

type JoinProps = { readonly join: JoinCode; readonly primary: boolean; readonly connecting: boolean; readonly onJoin: () => void };

function JoinForm({ join, primary, connecting, onJoin }: JoinProps) {
  const ids = { field: useId(), hint: useId(), error: useId() };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    onJoin();
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
          ref={join.input}
          id={ids.field}
          className="field-input room-code-input"
          value={join.code}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={join.error !== null}
          aria-describedby={join.error === null ? ids.hint : `${ids.hint} ${ids.error}`}
          onChange={(e) => join.change(e.target.value)}
        />
        <button type="submit" className={primary ? 'hud-primary' : 'hud-button'} disabled={connecting}>
          Join
        </button>
      </div>
      <p id={ids.error} className="join-error" hidden={join.error === null}>
        <span aria-hidden="true">✕ </span>
        {join.error}
      </p>
    </form>
  );
}

type Props = {
  readonly invite: Invite | null;
  readonly join: JoinCode;
  readonly connecting: boolean;
  readonly onCreate: () => void;
  readonly onJoin: () => void;
};

const inviteLine = (invite: Invite): string =>
  invite.why === 'link' ? `You have been invited to room ${invite.code}.` : `Join room ${invite.code} to get back in.`;

/** A new room is the main thing here, until a room is on offer: then joining it is, and it comes first. */
export function FriendsPanel({ invite, join, connecting, onCreate, onJoin }: Props) {
  const create = (
    <button type="button" className={invite === null ? 'hud-primary menu-wide' : 'hud-button menu-wide'} disabled={connecting} onClick={onCreate}>
      Create a room
    </button>
  );
  const joinForm = <JoinForm join={join} primary={invite !== null} connecting={connecting} onJoin={onJoin} />;
  if (invite === null) {
    return (
      <>
        {create}
        <p className="menu-or">or join one</p>
        {joinForm}
      </>
    );
  }
  return (
    <>
      <p className="menu-invite">{inviteLine(invite)}</p>
      {joinForm}
      <p className="menu-or">or start your own</p>
      {create}
    </>
  );
}
