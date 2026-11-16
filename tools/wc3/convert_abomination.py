"""Convert johnwar's Re-Classic Abomination into Hook Wars' character contract.

Requires wc3studio 1.6.4, numpy and Pillow. See README.md beside this script.
Source files remain in assets.local/; the converted GLB is a production asset.
"""
from __future__ import annotations

import argparse
import copy
import io
import json
from pathlib import Path
import struct
import tempfile

from PIL import Image
from wc3studio import Resources, export_glb, parse_mdx
from wc3studio.gltf import _write_glb


class LooseTextures(Resources):
    def __init__(self, folder: Path):
        super().__init__(None)
        self.files = {p.name.lower(): p for p in folder.rglob('*') if p.is_file()}

    def image(self, internal_path: str, replaceable_id: int = 0):
        if not internal_path:
            return super().image(internal_path, replaceable_id)
        key = internal_path.lower()
        if key not in self._images:
            name = internal_path.replace('\\', '/').rsplit('/', 1)[-1].lower()
            path = self.files.get(name)
            if path is None:
                raise ValueError(f'Missing texture: {internal_path}')
            data = path.read_bytes()
            # Hive's SD preview currently returns DDS bytes under .blp names.
            if data[:4] == b'DDS ':
                image = Image.open(io.BytesIO(data)).convert('RGBA')
            else:
                from wc3studio import decode_blp
                image = decode_blp(data).convert('RGBA')
            self._images[key] = image
        return self._images[key]


ALIASES = {
    'Idle': 'Stand - 1',
    'Running_A': 'Walk',
    'Throw': 'Attack - 2',
    '1H_Ranged_Aiming': 'Stand Channel',
    '1H_Melee_Attack_Slice_Horizontal': 'Attack - 1',
    'Hit_A': 'Stand - 1',
    'Hit_B': 'Stand Channel',
    'Jump_Idle': 'Stand Channel',
    'Blocking': 'Stand Channel',
    'Death_A': 'Death',
}


def convert(model_path: Path, textures: Path, output: Path):
    model = parse_mdx(model_path.read_bytes())
    if model.name != 'Abomination':
        raise ValueError('This adapter only supports the Re-Classic Abomination.')

    # Remove the built-in dangling chain/hook: the game supplies its own moving hook.
    # Also remove static fly cards, which require WC3 billboard behavior.
    removed = {'Chain_1', 'Chain_2', 'Box19', 'Box25', 'Box20', 'Box26', 'Box06'}
    for geoset in model.geosets:
        groups, offset = [], 0
        for count in geoset.matrix_groups:
            groups.append({model.nodes[b].name for b in geoset.matrix_indices[offset:offset + count]})
            offset += count
        geoset.faces = [v for i in range(0, len(geoset.faces), 3)
                         if not any(groups[geoset.vertex_groups[v]] & removed for v in geoset.faces[i:i + 3])
                         for v in geoset.faces[i:i + 3]]

    used = sorted({g.material_id for i, g in enumerate(model.geosets)
                   if i not in model.pose_hidden_geosets and g.faces})
    material_ids = {old: new for new, old in enumerate(used)}
    model.materials = [model.materials[i] for i in used]
    for geoset in model.geosets:
        geoset.material_id = material_ids.get(geoset.material_id, 0)

    # Only gameplay sequences: portraits, decay and exploding corpse parts are omitted.
    sequences = ['Stand - 1', 'Stand - 2', 'Stand - 3', 'Walk', 'Attack - 1', 'Attack - 2', 'Stand Channel', 'Death']
    model.sequences = [s for s in model.sequences if s['name'] in sequences]
    with tempfile.TemporaryDirectory() as temp:
        raw = Path(temp) / 'raw.glb'
        stats = export_glb(model, raw, LooseTextures(textures), sequences=sequences)
        if stats['missing_textures']:
            raise ValueError(f"Missing textures: {stats['missing_textures']}")
        data = raw.read_bytes()
    json_length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + json_length])
    binary = bytearray(data[28 + json_length:])
    nodes = gltf['nodes']

    # wc3studio flips V for OpenGL. glTF PNGs (and GLTFLoader's flipY=false)
    # use a top-left origin, like WC3: restore the source UVs for this pipeline.
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            accessor = gltf['accessors'][primitive['attributes']['TEXCOORD_0']]
            view = gltf['bufferViews'][accessor['bufferView']]
            offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
            for vertex in range(accessor['count']):
                at = offset + vertex * 8 + 4
                v = struct.unpack_from('<f', binary, at)[0]
                struct.pack_into('<f', binary, at, 1 - v)

    # MDX pivot transforms use absolute model coordinates. These slots translate to
    # each hand's pivot inside its animated bone, then inherit that bone's rotation.
    for slot, bone_name in [('handslotr', 'Bone_Hand_L'), ('handslotl', 'Bone_Hand_R')]:
        index = next(i for i, n in enumerate(nodes) if n.get('name') == bone_name)
        bone = next(n for n in model.nodes if n.name == bone_name)
        nodes[index].setdefault('children', []).append(len(nodes))
        # +Y of a slot points up the fist, as in the existing KayKit hand slots.
        nodes.append({'name': slot, 'translation': list(bone.pivot),
                      'rotation': [2 ** -0.5, 0, 0, 2 ** -0.5], 'scale': [1 / 0.012] * 3})

    # Z-up / +X forward becomes Y-up / +Z forward. The outer game root remains
    # untouched so dragging and grappling can tilt/lift the complete character.
    roots = gltf['scenes'][0]['nodes']
    mesh_roots = [i for i in roots if 'mesh' in nodes[i]]
    skeleton_roots = [i for i in roots if 'mesh' not in nodes[i]]
    nodes.append({'name': 'WC3CoordinateSystem', 'children': skeleton_roots,
                  'rotation': [-0.5, -0.5, -0.5, 0.5], 'scale': [0.012] * 3})
    # Skinning supplies the meshes' world transform through the joints; keep the
    # meshes at scene root as required for portable glTF skinning.
    gltf['scenes'][0]['nodes'] = [len(nodes) - 1, *mesh_roots]
    for skin in gltf['skins']:
        skin['skeleton'] = len(nodes) - 1
    gltf['scenes'][0]['extras'] = {'hookwarsCharacter': 'abomination'}

    # Source animations are retained under their own names as well as game aliases.
    animations = {a['name']: a for a in gltf['animations']}
    for alias, source in ALIASES.items():
        clip = copy.deepcopy(animations[source])
        clip['name'] = alias
        gltf['animations'].append(clip)

    # Pick_layer flattens WC3's two-layer team material; bake the underlying alpha
    # mask over a neutral cloth colour so it stays opaque and can be team-tinted.
    # Preserve the separate cutout material used by straps/teeth.
    team_material = gltf['materials'][2]
    team_material['extras'] = {'hookwarsTeamColor': True}
    team_material['alphaMode'] = 'OPAQUE'
    team_material.pop('alphaCutoff', None)
    texture = team_material['pbrMetallicRoughness']['baseColorTexture']['index']
    source_image = gltf['images'][gltf['textures'][texture]['source']]
    view = gltf['bufferViews'][source_image['bufferView']]
    start = view.get('byteOffset', 0)
    image = Image.open(io.BytesIO(binary[start:start + view['byteLength']])).convert('RGBA')
    base = Image.new('RGBA', image.size, (170, 170, 170, 255))
    base.alpha_composite(image)
    png = io.BytesIO()
    base.save(png, format='PNG')
    while len(binary) % 4:
        binary.append(0)
    gltf['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(png.getvalue())})
    binary.extend(png.getvalue())
    gltf['images'].append({'bufferView': len(gltf['bufferViews']) - 1, 'mimeType': 'image/png'})
    gltf['textures'].append({**gltf['textures'][texture], 'source': len(gltf['images']) - 1})
    team_material['pbrMetallicRoughness']['baseColorTexture']['index'] = len(gltf['textures']) - 1
    gltf['buffers'][0]['byteLength'] = len(binary)
    gltf['asset']['copyright'] = 'Model: johnwar, based on Ujimasa Hojo / Blizzard Entertainment. Textures: Blizzard Entertainment.'
    output.parent.mkdir(parents=True, exist_ok=True)
    _write_glb(output, gltf, binary)
    print(json.dumps({'output': str(output), 'bytes': output.stat().st_size,
                      'triangles': stats['triangles'], 'sourceAnimations': len(animations),
                      'gameAliases': ALIASES, 'textures': len(gltf['images'])}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--textures', type=Path, required=True)
    parser.add_argument('--out', type=Path, default=Path('apps/client/public/assets/wc3/Abomination.glb'))
    args = parser.parse_args()
    convert(args.model, args.textures, args.out)
