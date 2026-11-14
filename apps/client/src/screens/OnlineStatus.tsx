import type { ConnStatus } from '../net/connection';

const WORDS: Readonly<Record<ConnStatus['kind'], string>> = {
  connecting: 'Connecting',
  online: 'Online',
  reconnecting: 'Connection lost. Reconnecting',
  lost: 'Disconnected',
};

/**
 * The state of the line to the server, over whichever screen is up. The words change only when the state does, so a
 * screen reader hears "Reconnecting" once; the ping and the countdown tick beside them unannounced.
 */
export function OnlineStatus({ status }: { readonly status: ConnStatus | null }) {
  if (status === null) return null;
  return (
    <div className={`net-status hud-plate net-${status.kind}`}>
      <span className="net-dot" aria-hidden="true" />
      <span role="status">{WORDS[status.kind]}</span>
      {status.kind === 'online' && status.pingMs !== null && (
        <span className="net-detail">
          <span className="hud-sr">ping </span>
          {status.pingMs} ms
        </span>
      )}
      {status.kind === 'reconnecting' && (
        <span className="net-detail" aria-hidden="true">
          {status.secondsLeft} s left
        </span>
      )}
    </div>
  );
}
