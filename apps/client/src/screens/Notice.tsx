/** Why something the player asked for did not happen. An alert, so it is read out the moment it appears. */
export function Notice({ text }: { readonly text: string | null }) {
  return (
    <p role="alert" className="screen-notice" hidden={text === null}>
      {text}
    </p>
  );
}
