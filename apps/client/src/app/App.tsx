import { useSyncExternalStore } from 'react';
import { CreditsDialog } from '../credits/CreditsDialog';
import { Hud } from '../hud/Hud';
import { Lobby } from '../lobby/Lobby';
import { MainMenu } from '../menu/MainMenu';
import '../hud/hud.css';
import '../hud/shop.css';
import '../screens/screens.css';
import type { App as AppController, AppView } from './controller';

function Screen({ view, app }: { readonly view: AppView; readonly app: AppController }) {
  switch (view.route.screen) {
    case 'menu':
      return <MainMenu name={view.name} notice={view.notice} onPlay={app.play} />;
    case 'lobby':
      return <Lobby view={view} app={app} />;
    case 'match':
      return view.match === null ? null : <Hud match={view.match} onRematch={() => void app.rematch()} onLobby={app.leaveMatch} />;
  }
}

/** The screen the route names, with the credits able to open over any of them. */
export function App({ app }: { readonly app: AppController }) {
  const view = useSyncExternalStore(app.subscribe, app.getSnapshot);
  return (
    <>
      <Screen view={view} app={app} />
      <CreditsDialog open={view.route.credits} onClose={app.closeCredits} />
    </>
  );
}
