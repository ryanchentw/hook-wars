import type { TeamId } from '@hookbrawl/sim';
import { CREDITS_HASH } from '../credits/route';

export const TEAM_LABEL: Readonly<Record<TeamId, string>> = { west: 'West Dock', east: 'East Dock' };

export function CreditsLink() {
  return (
    <a className="hud-button" href={CREDITS_HASH}>
      Credits
    </a>
  );
}
