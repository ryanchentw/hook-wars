import type { TeamId } from '@hookwars/sim';
import { CREDITS_HASH } from '../app/route';

/** Named for the side of the screen, so the same words fit a harbour, a bridge and a park. */
export const TEAM_LABEL: Readonly<Record<TeamId, string>> = { west: 'West Side', east: 'East Side' };

export function CreditsLink() {
  return (
    <a className="hud-button" href={CREDITS_HASH}>
      Credits
    </a>
  );
}
