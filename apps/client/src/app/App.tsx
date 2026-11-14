import { useSyncExternalStore } from 'react';
import { CreditsDialog } from '../credits/CreditsDialog';
import { Hud } from '../hud/Hud';
import { Lobby } from '../lobby/Lobby';
import { MainMenu } from '../menu/MainMenu';
import { OnlineStatus } from '../screens/OnlineStatus';
import '../hud/hud.css';
import '../hud/shop.css';
import '../screens/screens.css';
import type { App as AppController, AppView } from './controller';

/** Offline the match is the player's own; online the next one is the host's to start. */
const mayRematch = (view: AppView): boolean => view.online === null || view.room.host === view.member;

function Screen({ view, app }: { readonly view: AppView; readonly app: AppController }) {
  switch (view.route.screen) {
    case 'menu':
      return <MainMenu name={view.name} notice={view.notice} invite={view.invite} connecting={view.connecting} onPlay={app.play} onCreate={app.createRoom} onJoin={app.joinRoom} />;
    case 'lobby':
      return <Lobby view={view} app={app} />;
    case 'match':
      return view.match === null ? null : <Hud match={view.match} onRematch={mayRematch(view) ? () => void app.rematch() : null} onLobby={app.leaveMatch} onLeave={app.leaveMatch} />;
  }
}

/** The screen the route names, with the credits able to open over any of them. */
export function App({ app }: { readonly app: AppController }) {
  const view = useSyncExternalStore(app.subscribe, app.getSnapshot);
  return (
    <>
      <Screen view={view} app={app} />
      <OnlineStatus status={view.connecting ? { kind: 'connecting' } : (view.online?.status ?? null)} />
      <CreditsDialog open={view.route.credits} onClose={app.closeCredits} />
    </>
  );
}
