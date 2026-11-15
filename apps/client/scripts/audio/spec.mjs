// Which original each shipped file comes from, relative to the download folder, and how it is cut.
// Sources (all CC0, licence checked on the pack's own licence file or the item's own page):
//   kenney-*      https://kenney.nl/assets/<pack>  (License.txt inside each zip: CC0 1.0)
//   oga/swishes   https://opengameart.org/content/swishes-sound-pack     (artisticdude, CC0)
//   oga/wind-*    https://opengameart.org/content/wind-whoosh-loop       (SketchMan3, CC0)
//   oga/rain-*    https://opengameart.org/content/rain-long-thunder      (WuxiaScrub, CC0)
//   music/...     https://opengameart.org/content/pondering-the-cosmos   (Ruskerdax, CC0)
//                 https://opengameart.org/content/battle-theme-0         (Wolfgang_, CC0)

const IMPACT = 'sfx/unpacked/impact-sounds/Audio';
const RPG = 'sfx/unpacked/rpg-audio/Audio';
const UI = 'sfx/unpacked/interface-sounds/Audio';
const DIGITAL = 'sfx/unpacked/digital-audio/Audio';
const SCIFI = 'sfx/unpacked/sci-fi-sounds/Audio';
const JINGLES = 'sfx/unpacked/music-jingles/Audio/Pizzicato jingles';
const SWISH = 'sfx/oga/swishes/swishes';

export const SFX = [
  { out: 'hook-throw-1', src: `${SWISH}/swish-7.wav` },
  { out: 'hook-throw-2', src: `${SWISH}/swish-8.wav` },
  { out: 'hook-throw-3', src: `${SWISH}/swish-9.wav` },
  { out: 'hook-hit-1', src: `${RPG}/knifeSlice.ogg` },
  { out: 'hook-hit-2', src: `${RPG}/knifeSlice2.ogg` },
  { out: 'hook-bounce-1', src: `${IMPACT}/impactMetal_light_000.ogg` },
  { out: 'hook-bounce-2', src: `${IMPACT}/impactMetal_light_001.ogg` },
  { out: 'hook-bounce-3', src: `${IMPACT}/impactMetal_light_003.ogg` },
  { out: 'melee-1', src: `${IMPACT}/impactPunch_heavy_000.ogg` },
  { out: 'melee-2', src: `${IMPACT}/impactPunch_heavy_001.ogg` },
  { out: 'melee-3', src: `${IMPACT}/impactPunch_heavy_004.ogg` },
  { out: 'hurt-1', src: `${IMPACT}/impactSoft_heavy_000.ogg` },
  { out: 'hurt-2', src: `${IMPACT}/impactSoft_heavy_001.ogg` },
  { out: 'hurt-3', src: `${IMPACT}/impactSoft_heavy_003.ogg` },
  { out: 'kill', src: `${SCIFI}/lowFrequency_explosion_001.ogg` },
  { out: 'respawn', src: `${DIGITAL}/powerUp2.ogg` },
  { out: 'purchase', src: `${RPG}/handleCoins2.ogg` },
  { out: 'refused', src: `${UI}/error_002.ogg` },
  { out: 'grapple-throw-1', src: `${RPG}/clothBelt.ogg` },
  { out: 'grapple-throw-2', src: `${RPG}/clothBelt2.ogg` },
  { out: 'grapple-bite-1', src: `${IMPACT}/impactWood_heavy_000.ogg` },
  { out: 'grapple-bite-2', src: `${IMPACT}/impactWood_heavy_002.ogg` },
  { out: 'grapple-arrive', src: `${IMPACT}/impactPlank_medium_000.ogg` },
  { out: 'pickup-caught-1', src: `${UI}/pluck_001.ogg` },
  { out: 'pickup-caught-2', src: `${UI}/pluck_002.ogg` },
  { out: 'gold', src: `${RPG}/handleCoins.ogg` },
  { out: 'gale', src: 'sfx/oga/wind-whoosh-loop/wind woosh loop.ogg', keepHead: true, cut: { start: 0, length: 1.8 }, fade: { in: 0.3, out: 0.8 } },
  { out: 'storm', src: 'sfx/oga/rain-long-thunder/rain-thunder.ogg', keepHead: true, cut: { start: 21.0, length: 4.0 }, fade: { in: 0.05, out: 1.5 } },
  { out: 'storm-bolt-1', src: `${DIGITAL}/zap1.ogg`, cut: { start: 0, length: 0.6 }, fade: { in: 0, out: 0.2 } },
  { out: 'storm-bolt-2', src: `${DIGITAL}/zap2.ogg`, cut: { start: 0, length: 0.6 }, fade: { in: 0, out: 0.2 } },
  { out: 'match-start', src: `${IMPACT}/impactBell_heavy_000.ogg` },
  { out: 'victory', src: `${JINGLES}/jingles_PIZZI02.ogg` },
  { out: 'defeat', src: `${JINGLES}/jingles_PIZZI07.ogg` },
  { out: 'ui-click', src: `${UI}/click_001.ogg` },
  { out: 'seat', src: `${UI}/confirmation_001.ogg` },
  { out: 'tick', src: `${UI}/tick_002.ogg` },
];

/** The menu track is written to loop, so its head is kept as it is; both are trimmed of silence at the tail. */
export const MUSIC = [
  { out: 'music-menu', src: 'music/downloads/opengameart/pondering-the-cosmos/Ruskerdax - Pondering the Cosmos_0.mp3', keepHead: true, kbps: 80 },
  { out: 'music-match', src: 'music/downloads/opengameart/battle-theme-0/Battle.mp3', keepHead: true, kbps: 96 },
];
