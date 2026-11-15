import { KILL_TARGETS, SCENE_IDS } from '@hookwars/room';
import type { RoomSettings, SceneChoice } from '@hookwars/room';
import { useId } from 'react';
import type { AppView, LocalAction } from '../app/controller';
import { SCENES } from '../render/scenes/registry';

type Act = (action: LocalAction) => void;

const SCENE_CHOICES: readonly SceneChoice[] = ['rotate', ...SCENE_IDS];
const sceneName = (choice: SceneChoice): string => (choice === 'rotate' ? 'Rotate each match' : SCENES[choice].title.name);
const onOff = (on: boolean): string => (on ? 'On' : 'Off');
const FOG_HINT = 'Enemies show only when someone on your side is close enough to see them.';
const PICKUPS_HINT = 'Gold, Gale and Storm drift down the water now and then; hook one and bring it home to use it.';

type SwitchProps = { readonly label: string; readonly hint: string; readonly on: boolean; readonly onChange: (on: boolean) => void };

function SwitchSetting({ label, hint, on, onChange }: SwitchProps) {
  const ids = { input: useId(), hint: useId() };
  return (
    <div className="setting">
      <label htmlFor={ids.input} className="field-label">
        {label}
      </label>
      <span className="switch-row">
        <input id={ids.input} type="checkbox" role="switch" className="switch" checked={on} aria-describedby={ids.hint} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-state" aria-hidden="true">
          {onOff(on)}
        </span>
      </span>
      <span id={ids.hint} className="hud-sr">
        {hint}
      </span>
    </div>
  );
}

function HostSettings({ settings, act }: { readonly settings: RoomSettings; readonly act: Act }) {
  const ids = { scene: useId(), kills: useId() };
  return (
    <div className="lobby-settings hud-plate">
      <div className="setting setting-scene">
        <label htmlFor={ids.scene} className="field-label">
          Scene
        </label>
        <select id={ids.scene} className="field-input" value={settings.scene} onChange={(e) => act({ kind: 'setScene', scene: e.target.value })}>
          {SCENE_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {sceneName(choice)}
            </option>
          ))}
        </select>
      </div>
      <div className="setting">
        <label htmlFor={ids.kills} className="field-label">
          Kills to win
        </label>
        <select id={ids.kills} className="field-input" value={settings.killTarget} onChange={(e) => act({ kind: 'setKillTarget', killTarget: Number(e.target.value) })}>
          {KILL_TARGETS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <SwitchSetting label="Fog of war" hint={FOG_HINT} on={settings.fog} onChange={(fog) => act({ kind: 'setFog', fog })} />
      <SwitchSetting label="River pickups" hint={PICKUPS_HINT} on={settings.pickups} onChange={(pickups) => act({ kind: 'setPickups', pickups })} />
    </div>
  );
}

/** What a guest sees: the host's choices as plain words, not controls they cannot use. */
function ReadOnlySettings({ settings }: { readonly settings: RoomSettings }) {
  const rows: readonly (readonly [string, string])[] = [
    ['Scene', sceneName(settings.scene)],
    ['Kills to win', String(settings.killTarget)],
    ['Fog of war', onOff(settings.fog)],
    ['River pickups', onOff(settings.pickups)],
  ];
  return (
    <dl className="lobby-settings hud-plate">
      {rows.map(([term, value], i) => (
        <div key={term} className={i === 0 ? 'setting setting-scene' : 'setting'}>
          <dt className="field-label">{term}</dt>
          <dd className="setting-value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LobbySettings({ view, act }: { readonly view: AppView; readonly act: Act }) {
  const { settings } = view.room;
  return view.room.host === view.member ? <HostSettings settings={settings} act={act} /> : <ReadOnlySettings settings={settings} />;
}
