import { CHAT_MAX_GRAPHEMES, CHAT_MAX_UNITS, graphemeCount, type ChatChannel } from '@hookwars/protocol';
import type { TeamId } from '@hookwars/sim';
import { useEffect, useId, useRef, type ChangeEvent, type CompositionEvent, type KeyboardEvent } from 'react';
import { chatKeyAction, NO_COMPOSITION, pressOf, type Composition } from './chatKeys';
import { clampDraft, COUNTER_FROM } from './chatState';

export const CHANNEL_LABEL: Readonly<Record<ChatChannel, string>> = { all: 'All', team: 'Team' };

type Props = {
  readonly channel: ChatChannel;
  /** False where there is only All, as in the lobby: Tab then moves focus as usual. */
  readonly canSwitch: boolean;
  /** Colours the Team label with the side it goes to. */
  readonly team: TeamId | null;
  readonly draft: string;
  readonly onDraft: (draft: string) => void;
  readonly onSend: () => void;
  readonly onCancel: () => void;
  readonly onSwitch: () => void;
  readonly onBlur?: () => void;
  readonly focusOnMount: boolean;
  readonly placeholder: string;
};

/**
 * One line of text in a real input, so an input method draws its candidates at the caret. Enter, Escape and Tab are
 * read through `chatKeyAction`, which leaves every key an input method is still using to the input method.
 */
export function ChatComposer({ channel, canSwitch, team, draft, onDraft, onSend, onCancel, onSwitch, onBlur, focusOnMount, placeholder }: Props) {
  const inputId = useId();
  const counterId = useId();
  const input = useRef<HTMLInputElement>(null);
  const composition = useRef<Composition>(NO_COMPOSITION);
  useEffect(() => {
    if (focusOnMount) input.current?.focus();
  }, [focusOnMount]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const action = chatKeyAction(pressOf(event.nativeEvent), composition.current, canSwitch);
    if (action === 'type') return;
    // Nothing behind the input may act on these: not the pause on Escape, nor the scoreboard on Tab.
    event.stopPropagation();
    if (action === 'ime') return;
    event.preventDefault();
    if (action === 'send') onSend();
    else if (action === 'cancel') onCancel();
    else onSwitch();
  };
  // Cutting the text mid-composition would throw away the candidate being chosen; the cut waits for the commit.
  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const { value } = event.target;
    const composing = composition.current.active || (event.nativeEvent as InputEvent).isComposing === true;
    onDraft(composing ? value : clampDraft(value));
  };
  const onCompositionEnd = (event: CompositionEvent<HTMLInputElement>): void => {
    composition.current = { active: false, endedAt: event.nativeEvent.timeStamp };
    onDraft(clampDraft(event.currentTarget.value));
  };
  const count = graphemeCount(draft);
  const teamClass = channel === 'team' && team !== null ? ` hud-${team}` : '';

  return (
    <div className="chat-compose" data-channel={channel}>
      <label htmlFor={inputId} className={`chat-channel${teamClass}`}>
        {CHANNEL_LABEL[channel]}
        <span className="hud-sr"> chat</span>
      </label>
      <input
        ref={input}
        id={inputId}
        type="text"
        className="chat-input"
        value={draft}
        placeholder={placeholder}
        maxLength={CHAT_MAX_UNITS}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="send"
        aria-describedby={counterId}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onCompositionStart={() => (composition.current = { ...composition.current, active: true })}
        onCompositionEnd={onCompositionEnd}
        onBlur={onBlur}
      />
      <span id={counterId} className="chat-counter" data-full={count >= CHAT_MAX_GRAPHEMES}>
        {count >= COUNTER_FROM ? `${count}/${CHAT_MAX_GRAPHEMES}` : ''}
      </span>
    </div>
  );
}
