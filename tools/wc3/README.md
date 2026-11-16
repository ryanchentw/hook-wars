# WC3 Abomination conversion

The Re-Classic Abomination is converted to a self-contained, textured, animated GLB for the existing Three.js renderer. Start `pnpm dev`, then open:

<http://localhost:5183/?opponent=idle&intro=off&quality=low>

The default fighter is `apps/client/public/assets/wc3/Abomination.glb`, included in production builds. Source MDX and texture files remain in `assets.local/`, ignored by Git (`*.local`). No model viewer or Windows application is needed at runtime.

## Sources and attribution

- Model: [Abomination (Re-Classic), johnwar](https://www.hiveworkshop.com/threads/abomination-re-classic.357166/), based on [Abomination and Derivatives, Ujimasa Hojo / Blizzard Entertainment](https://www.hiveworkshop.com/threads/abomination-and-derivatives.237374/).
- Textures: Blizzard Entertainment. The source model references Warcraft III's `Textures\Abomination.blp` and `Units\Orc\Grunt\Grunt.blp`. They are supplied by Hive's public SD preview. Despite their filenames, that endpoint currently returns DDS data, which the converter detects by its header.
- Conversion library: [wc3studio 1.6.4](https://github.com/zxclushkin/wc3studio), MIT. Its code license does not cover the models or textures.

The model author permits edits with attribution. Underlying model and texture rights remain with their owners; these assets are not CC0. Public attribution is included in `apps/client/public/assets/wc3/CREDITS.txt` and the in-game credits. Conversion and attribution do not themselves establish an additional license to Blizzard content.

## Reproduce the conversion

Use Python 3.10+ with `numpy`, `Pillow`, and the `wc3studio` 1.6.4 source package installed. Keep the source MDX and its two required textures in a dedicated directory. The converter accepts original BLP textures as well as Hive's DDS responses. It fails if a required texture is missing.

```sh
python tools/wc3/convert_abomination.py \
  --model assets.local/wc3/source/AbominationV2.mdx \
  --textures assets.local/wc3/source \
  --out apps/client/public/assets/wc3/Abomination.glb
```

The environment used for this conversion is available in this workspace session:

```sh
PYTHONPATH=/private/tmp/wc3studio-main \
  /private/tmp/wc3-convert-venv/bin/python tools/wc3/convert_abomination.py \
  --model assets.local/wc3/source/AbominationV2.mdx \
  --textures assets.local/wc3/source
```

Downloaded input SHA-256 hashes:

| File | SHA-256 |
| --- | --- |
| AbominationV2.mdx | f88ecd26c69b899fe9b0a4b3f6397f55459e18013600198fa14146c7a9e012aa |
| Abomination.blp (DDS) | 3beaa3cfba86995640ae52b60f7bbd23255faf5519dafc9ba951e7a85b7bc74c |
| Grunt.blp (DDS) | f13e6f218c568aeaa0c78fb30c83c85e3be134f3f4443359a530a98f9c936383 |

## Adaptations and limits

- Converts WC3's Z-up/+X-forward coordinates to the game's Y-up/+Z-forward convention.
- Preserves eight original sequences: three stands, walk, two attacks, channel, and death. Adds the clip names expected by the current animation controller.
- Uses Attack 2 for throwing and Attack 1 for melee. The source has no dedicated throw, hit reaction, drag, or grapple animation: those states reuse standing/channel clips alongside the game's existing recoil and tilt effects.
- Adds `handslotr` to the original left hand (hook) and `handslotl` to the original right hand (grapple). Slot scales compensate for the source model's units so the game's held hook keeps its world size.
- Removes the original chain/hook triangles and billboard fly cards. Retains the cleavers. Omits portraits, corpse decay, particles, and explosive-death geometry.
- Preserves textured/cutout materials and flattens WC3's team-colour layer to an opaque, tintable material. Corrects wc3studio's OpenGL V flip for GLTFLoader's top-left texture convention.
- The resulting model has 1,074 triangles. The GLB includes all texture bytes; no external texture requests are needed.

The converter is specific to this Re-Classic model, not a general Warcraft asset importer.
