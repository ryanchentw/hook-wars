const BOT_SUFFIX = ' (bot)';

/** The one way a fighter's name is shown in a match: anyone a computer drives right now carries the suffix. */
export function fighterName(fighter: { readonly name: string; readonly isBot: boolean }): string {
  return fighter.isBot ? `${fighter.name}${BOT_SUFFIX}` : fighter.name;
}
