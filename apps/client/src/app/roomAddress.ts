import { roomCodeSchema } from '@hookbrawl/protocol';

const PARAM = 'room';

/** Where the page keeps the code of the online room it is in: `?room=CODE`, which is also the link a friend opens. */
export type RoomAddress = {
  /** The code in the address, or null when there is none or it is not a code. */
  code(): string | null;
  /** Puts the code in the address, or takes it out, without adding a history entry. */
  set(code: string | null): void;
  linkFor(code: string): string;
};

/** A code as typed or pasted, tidied; null when it is not one. */
export function parseRoomCode(raw: string | null): string | null {
  const parsed = roomCodeSchema.safeParse(raw ?? '');
  return parsed.success ? parsed.data : null;
}

type Win = Pick<Window, 'location' | 'history'>;

export function createRoomAddress(win: Win): RoomAddress {
  const withCode = (code: string | null, hash: string): string => {
    const params = new URLSearchParams(win.location.search);
    if (code === null) params.delete(PARAM);
    else params.set(PARAM, code);
    const query = params.toString();
    return win.location.pathname + (query === '' ? '' : `?${query}`) + hash;
  };
  return {
    code: () => parseRoomCode(new URLSearchParams(win.location.search).get(PARAM)),
    set: (code) => win.history.replaceState(win.history.state, '', withCode(code, win.location.hash)),
    linkFor: (code) => win.location.origin + withCode(code, ''),
  };
}
