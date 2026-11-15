import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { MENU_TABS, TAB_LABELS, tabAfterKey, type MenuTab } from './menuChoice';

type Props = {
  readonly selected: MenuTab;
  readonly onSelect: (tab: MenuTab) => void;
  /** Shown under the tabs whichever is open, above its panel. */
  readonly between: ReactNode;
  readonly panel: (tab: MenuTab) => ReactNode;
};

/**
 * The WAI-ARIA tabs pattern by hand: one Tab stop on the selected tab, arrows move and select together. `focusgroup`
 * would do this natively, but Safari and Firefox do not have it yet.
 */
export function MenuTabs({ selected, onSelect, between, panel }: Props) {
  const base = useId();
  const tabs = useRef(new Map<MenuTab, HTMLButtonElement>());
  const tabId = (tab: MenuTab): string => `${base}-${tab}`;

  const onKeyDown = (event: KeyboardEvent): void => {
    const next = tabAfterKey(selected, event.key);
    if (next === null) return;
    event.preventDefault();
    onSelect(next);
    tabs.current.get(next)?.focus();
  };

  return (
    <div className="menu-tabs">
      <div role="tablist" aria-label="How to play" className="menu-tablist" onKeyDown={onKeyDown}>
        {MENU_TABS.map((tab) => (
          <button
            key={tab}
            ref={(el) => {
              if (el === null) tabs.current.delete(tab);
              else tabs.current.set(tab, el);
            }}
            type="button"
            role="tab"
            id={tabId(tab)}
            className="menu-tab"
            aria-selected={tab === selected}
            tabIndex={tab === selected ? 0 : -1}
            onClick={() => onSelect(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
      {between}
      <div className="menu-panels">
        {MENU_TABS.map((tab) => (
          <div key={tab} role="tabpanel" aria-labelledby={tabId(tab)} className="menu-tabpanel" hidden={tab !== selected}>
            {panel(tab)}
          </div>
        ))}
      </div>
    </div>
  );
}
