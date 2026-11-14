import { useEffect, useId, useRef } from 'react';
import { CREDITS } from './content';
import './credits.css';

type Props = { readonly open: boolean; readonly onClose: () => void };

/** A native modal: the browser supplies the inert page, focus containment, Escape and focus return to the opener. */
export function CreditsDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="credits" aria-labelledby={titleId} lang="zh-Hant" onClose={onClose}>
      <form method="dialog" className="credits-bar">
        <button type="submit" className="credits-close" lang="en" autoFocus>
          Close
        </button>
      </form>
      <header className="credits-head">
        <h2 id={titleId}>{CREDITS.title}</h2>
        <p className="credits-subtitle">{CREDITS.subtitle}</p>
      </header>
      <p>{CREDITS.intro}</p>
      {CREDITS.sections.map((section) => (
        <section key={section.heading}>
          <h3>{section.heading}</h3>
          <ul className="credits-list">
            {section.entries.map((entry) => (
              <li key={entry.name}>
                <strong>{entry.name}</strong>：{entry.text}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section>
        <h3>{CREDITS.about.heading}</h3>
        {CREDITS.about.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </section>
      <footer className="credits-sources">
        {CREDITS.sources.before}
        <a href={CREDITS.sources.href} target="_blank" rel="noreferrer">
          {CREDITS.sources.linkText}
        </a>
        {CREDITS.sources.after}
      </footer>
    </dialog>
  );
}
