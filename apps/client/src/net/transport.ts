import { IDLE_LINE, scheduleDelivery, type LagLine, type LagRules } from './lagSim';

export type TransportEvents = {
  readonly onOpen: () => void;
  readonly onFrame: (frame: unknown) => void;
  /** Called once, however the line ended, including when it never opened. */
  readonly onClose: () => void;
};

export type Transport = { send(frame: string): void; close(): void };

/** Opens a line to `url`. Injected, so tests and the simulated line can stand in for the browser's socket. */
export type OpenTransport = (url: string, events: TransportEvents) => Transport;

export const openWebSocket: OpenTransport = (url, events) => {
  const socket = new WebSocket(url);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    events.onClose();
  };
  socket.addEventListener('open', events.onOpen);
  socket.addEventListener('message', (event: MessageEvent<unknown>) => events.onFrame(event.data));
  socket.addEventListener('close', close);
  // The browser says nothing useful in an error event, and always follows it with a close.
  socket.addEventListener('error', () => socket.close());
  return {
    send(frame) {
      if (socket.readyState === WebSocket.OPEN) socket.send(frame);
    },
    close() {
      socket.close();
      close();
    },
  };
};

type Timers = { now(): number; setTimeout(run: () => void, ms: number): unknown };

/** The same line with a simulated delay and loss in each direction, for hearing how the game feels on a worse one. */
export function withLag(open: OpenTransport, rules: LagRules, timers: Timers, random: () => number): OpenTransport {
  return (url, events) => {
    let up: LagLine = IDLE_LINE;
    let down: LagLine = IDLE_LINE;
    let closed = false;
    const later = (line: LagLine, run: () => void): LagLine => {
      const scheduled = scheduleDelivery(line, timers.now(), random(), rules);
      timers.setTimeout(() => closed || run(), scheduled.at - timers.now());
      return scheduled.line;
    };
    const inner = open(url, {
      onOpen: events.onOpen,
      onFrame: (frame) => (down = later(down, () => events.onFrame(frame))),
      onClose() {
        closed = true;
        events.onClose();
      },
    });
    return {
      send: (frame) => (up = later(up, () => inner.send(frame))),
      close: () => inner.close(),
    };
  };
}
