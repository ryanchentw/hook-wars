import { describe, expect, it } from 'vitest';
import { CREDITS_HASH, parseHash, routeFor } from './route';

describe('parseHash', () => {
  it('opens credits for the credits hash, with a trailing slash or any letter case', () => {
    for (const hash of [CREDITS_HASH, '#/credits/', '#/Credits']) expect(parseHash(hash)).toEqual({ kind: 'credits' });
  });

  it('names the menu, the lobby and the match', () => {
    expect(parseHash('#/')).toEqual({ kind: 'screen', screen: 'menu' });
    expect(parseHash('#/lobby')).toEqual({ kind: 'screen', screen: 'lobby' });
    expect(parseHash('#/Lobby/')).toEqual({ kind: 'screen', screen: 'lobby' });
    expect(parseHash('#/match')).toEqual({ kind: 'screen', screen: 'match' });
  });

  it('goes home for an empty or unknown hash', () => {
    for (const hash of ['', '#', '#credits-and-more', '#/creditsx', '#/lobbyist']) expect(parseHash(hash)).toEqual({ kind: 'home' });
  });
});

describe('routeFor', () => {
  it('keeps the screen under the credits, or home on a direct visit', () => {
    expect(routeFor({ kind: 'credits' }, { screen: 'lobby', credits: false }, 'menu')).toEqual({ screen: 'lobby', credits: true });
    expect(routeFor({ kind: 'credits' }, null, 'match')).toEqual({ screen: 'match', credits: true });
  });

  it('sends home to the menu, or to the match a test address asks for', () => {
    expect(routeFor({ kind: 'home' }, null, 'menu')).toEqual({ screen: 'menu', credits: false });
    expect(routeFor({ kind: 'home' }, null, 'match')).toEqual({ screen: 'match', credits: false });
    expect(routeFor({ kind: 'screen', screen: 'lobby' }, null, 'match')).toEqual({ screen: 'lobby', credits: false });
  });
});
