import GUI, { type Controller } from 'lil-gui';
import { KNOBS, readKnob, type Knob, type KnobValue } from './knobs';
import { parseOverrides, toJson, type LookOverrides } from './overrides';
import type { Tuner } from './tuner';
import './panel.css';

export type Panel = { setOpen(open: boolean): void; isOpen(): boolean };

const WIDTH_PX = 290;
const STATUS_MS = 2500;
/** Open at first: what this panel was made to tune. The rest are a click away. */
const OPEN_GROUPS: ReadonlySet<string> = new Set(['Water', 'Bloom', 'Fighter rim']);
const DOCKS = ['right', 'left'] as const;
const KEY_EVENTS = ['keydown', 'keyup', 'keypress'] as const;

const countChanged = (all: LookOverrides): number => Object.values(all).reduce((sum, scene) => sum + Object.keys(scene).length, 0);

function describeChanged(all: LookOverrides): string {
  const scenes = Object.entries(all).map(([scene, values]) => `${scene} ${Object.keys(values).length}`);
  return scenes.length === 0 ? '' : `Overrides active, not the shipped look: ${scenes.join(', ')}`;
}

type Status = { say(text: string): void };

function createStatus(parent: HTMLElement): Status {
  const line = document.createElement('p');
  line.className = 'look-status';
  line.setAttribute('role', 'status');
  parent.append(line);
  let timer = 0;
  return {
    say(text) {
      window.clearTimeout(timer);
      line.textContent = text;
      timer = window.setTimeout(() => (line.textContent = ''), STATUS_MS);
    },
  };
}

type Bound = { readonly knob: Knob; readonly controller: Controller };

/** One control per knob, grouped in folders. lil-gui edits a plain object in place, so `model` is that object and nothing else reads it. */
function addKnobs(gui: GUI, model: Record<string, KnobValue>, onChange: (knob: Knob, value: KnobValue) => void): readonly Bound[] {
  const folders = new Map<string, GUI>();
  return KNOBS.map((knob) => {
    const folder = folders.get(knob.group) ?? gui.addFolder(knob.group);
    if (!folders.has(knob.group) && !OPEN_GROUPS.has(knob.group)) folder.close();
    folders.set(knob.group, folder);
    model[knob.id] = knob.kind === 'toggle' ? false : 0;
    const controller = knob.kind === 'color' ? folder.addColor(model, knob.id) : knob.kind === 'number' ? folder.add(model, knob.id, knob.min, knob.max, knob.step) : folder.add(model, knob.id);
    controller.name(knob.label).onChange((value: KnobValue) => onChange(knob, value));
    return { knob, controller };
  });
}

async function copyJson(tuner: Tuner, pasteBox: HTMLTextAreaElement, status: Status): Promise<void> {
  const json = toJson(tuner.overrides());
  try {
    await navigator.clipboard.writeText(json);
    status.say(`Copied ${countChanged(tuner.overrides())} changed values`);
  } catch {
    // The clipboard can be refused, as it is when the page is not focused: the JSON is put where it can be copied by hand.
    pasteBox.value = json;
    pasteBox.select();
    status.say('Copy was refused: the JSON is in the box, selected');
  }
}

function applyJson(tuner: Tuner, pasteBox: HTMLTextAreaElement, status: Status): void {
  const parsed = parseOverrides(pasteBox.value);
  if (!parsed.ok) return status.say(parsed.errors.join('; '));
  tuner.apply(parsed.overrides);
  status.say(`Applied ${countChanged(parsed.overrides)} values`);
}

function addActions(gui: GUI, tuner: Tuner, root: HTMLElement): void {
  const folder = gui.addFolder('Copy, paste, reset');
  const pasteBox = document.createElement('textarea');
  pasteBox.className = 'look-paste';
  pasteBox.rows = 4;
  pasteBox.spellcheck = false;
  pasteBox.placeholder = '{ "victoria": { "bloom.strength": 0.8 } }';
  pasteBox.setAttribute('aria-label', 'Look overrides as JSON, to apply');
  const status: Status = { say: (text) => shown.say(text) };
  let dock = 0;
  const actions = {
    'Copy changed values as JSON': () => void copyJson(tuner, pasteBox, status),
    'Apply the JSON below': () => applyJson(tuner, pasteBox, status),
    'Reset this scene': () => tuner.resetScene(),
    'Reset every scene': () => tuner.resetAll(),
    'Move panel to the other side': () => {
      dock = (dock + 1) % DOCKS.length;
      root.dataset.dock = DOCKS[dock];
    },
  };
  (Object.keys(actions) as (keyof typeof actions)[]).forEach((name) => folder.add(actions, name));
  folder.$children.append(pasteBox);
  const shown = createStatus(folder.$children);
}

/** Keys typed in the panel stay in it: the match's own listeners are on the window and would move the fighter. */
function keepKeys(root: HTMLElement): void {
  KEY_EVENTS.forEach((type) => root.addEventListener(type, (event) => event.stopPropagation()));
  root.addEventListener('pointerdown', (event) => event.stopPropagation());
  // A slider keeps focus after a drag, which would hold the keyboard here; fields being typed in keep it.
  root.addEventListener('pointerup', () => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && root.contains(focused) && !focused.matches('input[type="text"], input[type="number"], textarea')) focused.blur();
  });
}

export function createPanel(tuner: Tuner): Panel {
  const root = document.createElement('aside');
  root.className = 'look-panel';
  root.dataset.dock = DOCKS[0];
  root.setAttribute('aria-label', 'Look tuning (development only)');
  root.hidden = true;
  const mark = document.createElement('p');
  mark.className = 'look-mark';
  root.append(mark);
  document.body.append(root);
  keepKeys(root);

  const model: Record<string, KnobValue> = {};
  const gui = new GUI({ container: root, width: WIDTH_PX, title: 'Look' });
  const bound = addKnobs(gui, model, (knob, value) => tuner.set(knob, value));
  addActions(gui, tuner, root);

  const sync = (): void => {
    const scene = tuner.current();
    const tuned = tuner.tuned();
    gui.title(scene === null ? 'Look · no scene on show' : `Look · ${scene.id}`);
    mark.textContent = describeChanged(tuner.overrides());
    mark.hidden = mark.textContent === '';
    if (scene === null || tuned === null) return;
    const changed = tuner.overrides()[scene.id] ?? {};
    bound.forEach(({ knob, controller }) => {
      model[knob.id] = readKnob(tuned, knob);
      controller.updateDisplay();
      controller.domElement.classList.toggle('look-changed', knob.id in changed);
    });
  };
  tuner.subscribe(sync);
  sync();

  return {
    setOpen(open) {
      root.hidden = !open;
    },
    isOpen: () => !root.hidden,
  };
}
