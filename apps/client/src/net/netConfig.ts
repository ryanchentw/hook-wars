/** Every number the client's netcode runs by. Seconds unless the name says otherwise. */
export const NET = {
  /**
   * How far behind the newest snapshot other fighters, hooks and grapples are drawn. Snapshots come 33 or 67 ms apart,
   * so this holds one whole gap and a little jitter: there is nearly always a snapshot on each side of the drawn moment.
   */
  interpolationDelay: 0.1,
  /** Snapshots kept. At twenty a second this is over a second, far more than the delay needs. */
  snapshotBufferSize: 32,
  /** How hard the drawn moment is pulled to where it should be: this share of the error is closed per second. */
  playoutGain: 2,
  /** The most the drawn moment may run fast or slow while it catches up, as a share of real time. */
  playoutMaxSpeedUp: 0.25,
  playoutMaxSlowDown: 0.1,
  /** Further off than this and the drawn moment jumps: nobody wants a second of fast-forward after a stall. */
  playoutSnap: 0.4,
  /** How quickly the clock estimate follows a line that has become slower. A faster packet corrects it at once. */
  clockDrift: 0.1,
  /** A correction to the local fighter's place is spread over time; half of what is left goes in this long. */
  correctionHalfLife: 0.06,
  /** Sim units. A correction this large is a respawn or a drag, not an error to smooth. */
  correctionSnap: 150,
  /** Unacknowledged inputs kept for replay: two seconds of them. Older ones are from before a stall and are dropped. */
  maxPendingInputs: 60,
  pingIntervalMs: 1000,
  /** Pings averaged for the number shown. */
  pingSamples: 5,
  /** The server sends something at least every ping; this long with nothing and the line is treated as dead. */
  silenceTimeoutMs: 4000,
  reconnectFirstDelayMs: 300,
  reconnectMaxDelayMs: 3000,
  /** How long the server holds a dropped seat. The server decides; this only sets the countdown shown. */
  rejoinWindowMs: 60_000,
  /** How long a dropped message waits to be sent again in the simulated line, about what TCP takes. */
  lagSimRetransmitMs: 200,
} as const;
