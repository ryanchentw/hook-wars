import { useEffect, useId, useState } from 'react';
import type { Invite } from '../app/onlineMode';
import { GAME_VERSION } from '@hookwars/protocol';
import { CreditsLink } from '../hud/labels';
import type { QualitySetting } from '../render/quality';
import { Notice } from '../screens/Notice';
import { Settings } from '../settings/Settings';
import { FriendsPanel, useJoinCode } from './FriendsPanel';
import { openingTab, primaryAction, type MenuTab, type PrimaryAction } from './menuChoice';
import { MenuTabs } from './MenuTabs';
import { NameField, useName, type Enter } from './NameField';
import { menuTabMemory } from './tabMemory';
import './menu.css';

type Props = {
  readonly name: string;
  readonly notice: string | null;
  /** A room to offer: joining it becomes the main thing to do. */
  readonly invite: Invite | null;
  /** A room has been asked for and the server has not answered yet. */
  readonly connecting: boolean;
  readonly quality: QualitySetting;
  readonly onPlay: Enter;
  readonly onCreate: Enter;
  readonly onJoin: (name: string, code: string) => string | null;
};

/** Which tab is open: chosen once on arrival, switched to With friends whenever a room comes on offer, remembered on use. */
function useMenuTab(invite: Invite | null): readonly [MenuTab, (tab: MenuTab) => void] {
  const [tab, setTab] = useState(() => openingTab(invite, menuTabMemory.load()));
  useEffect(() => {
    if (invite !== null) setTab('friends');
  }, [invite]);
  const choose = (next: MenuTab): void => {
    setTab(next);
    menuTabMemory.save(next);
  };
  return [tab, choose];
}

function SoloPanel({ onPlay }: { readonly onPlay: () => void }) {
  return (
    <>
      <p className="menu-lead">Fight bots on this machine, no waiting.</p>
      <button type="button" className="hud-primary menu-wide" onClick={onPlay}>
        Play
      </button>
    </>
  );
}

/** Name, then how to play, then go. Everything else waits behind Settings. */
export function MainMenu({ name, notice, invite, connecting, quality, onPlay, onCreate, onJoin }: Props) {
  const player = useName(name);
  const join = useJoinCode(invite);
  const [tab, choose] = useMenuTab(invite);
  const titleId = useId();

  useEffect(() => player.input.current?.focus(), [player.input]);

  const run = (action: PrimaryAction): void => {
    menuTabMemory.save(tab);
    if (action === 'play') return player.go(onPlay);
    if (action === 'create') return player.go(onCreate);
    const code = join.check();
    if (code !== null) player.go((typed) => onJoin(typed, code));
  };

  return (
    <main className="screen menu" aria-labelledby={titleId}>
      <div className="screen-panel hud-plate menu-panel">
        <h1 id={titleId} className="menu-title">
          Hook Wars
        </h1>
        <p className="menu-tagline">A hook duel across the water</p>
        <NameField state={player} onEnter={() => run(primaryAction(tab, invite))} />
        <MenuTabs
          selected={tab}
          onSelect={choose}
          between={<Notice text={notice} />}
          panel={(which) =>
            which === 'solo' ? (
              <SoloPanel onPlay={() => run('play')} />
            ) : (
              <FriendsPanel invite={invite} join={join} connecting={connecting} onCreate={() => run('create')} onJoin={() => run('join')} />
            )
          }
        />
        <div className="menu-footer">
          <Settings quality={quality} buttonClass="menu-quiet" />
          <CreditsLink className="menu-quiet" />
          <span className="menu-version">v{GAME_VERSION}</span>
        </div>
      </div>
    </main>
  );
}
