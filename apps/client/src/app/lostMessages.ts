import type { LostReason } from '../net/connection';

/** Why the player is back on the menu, in words for them. Every one of them says what to do next. */
const MESSAGES: Readonly<Record<LostReason, string>> = {
  'room-not-found': 'No room has that code. Check it with whoever sent it, or create a new room.',
  'room-full': 'That room is full: all six seats are taken.',
  'name-taken': 'Someone in that room already has that name. Change yours and join again.',
  'rejoin-refused': 'Your seat in that room is gone. Join again with the room code.',
  'timed-out': 'The connection was lost for over a minute, so your seat was given up. Join again with the room code.',
  unreachable: 'The game server cannot be reached. Try again in a moment, or play offline.',
  'server-full': 'The server has no space for another room right now. Try again in a few minutes.',
  'rate-limited': 'Too many tries from this connection. Wait a minute, then try again.',
  'bad-version': 'This page is out of date. Reload it to play online.',
  'bad-message': 'The server and this page could not understand each other. Reload the page and try again.',
  replaced: 'This room was opened somewhere else with your seat. That one has it now.',
  shutdown: 'The server restarted and the room was closed. Create a new room to carry on.',
};

export const lostMessage = (reason: LostReason): string => MESSAGES[reason];
