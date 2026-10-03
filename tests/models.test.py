"""Check shipped GLBs; optionally compare original vehicle geometry/textures."""
import argparse, json, struct
from pathlib import Path


def read(path):
    raw = path.read_bytes()
    assert struct.unpack_from('<III', raw) == (0x46546c67, 2, len(raw))
    length, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4e4f534a
    binary_length, binary_kind = struct.unpack_from('<II', raw, 20 + length)
    assert binary_kind == 0x004e4942 and binary_length == len(raw) - 28 - length
    return json.loads(raw[20:20 + length]), raw[28 + length:]


def view(doc, binary, index):
    v = doc['bufferViews'][index]
    start = v.get('byteOffset', 0)
    assert start % 4 == 0 and start + v['byteLength'] <= len(binary)
    return binary[start:start + v['byteLength']]


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--original-dir', type=Path)
args = parser.parse_args()
assets = Path(__file__).resolve().parents[1] / 'app/src/main/assets/models'
for faction, color in [('friendly', [0, 0, 1, 1]), ('enemy', [1, 0, 0, 1])]:
    doc, binary = read(assets / f'm1097_{faction}.glb')
    patches = [n for n in doc['nodes'] if n.get('name', '').startswith('IFF_')]
    assert len(patches) == 2 and len(doc['meshes']) == 4
    assert {n['name'] for n in patches} == {f'IFF_{faction}_solid_left', f'IFF_{faction}_solid_right'}
    for patch in patches:
        primitives = doc['meshes'][patch['mesh']]['primitives']
        assert len(primitives) == 1
        material = doc['materials'][primitives[0]['material']]['pbrMetallicRoughness']
        assert material['baseColorFactor'] == color and 'baseColorTexture' not in material
        assert patch['matrix'][0] < .5 and patch['matrix'][10] < .2
    for index in range(len(doc['bufferViews'])):
        view(doc, binary, index)
    assert len(doc['images']) == 2 and all('uri' not in i for i in doc['images'])
    if args.original_dir:
        original, original_binary = read(args.original_dir / f'm1097_avenger_blindfire_{faction}(1).glb')
        for mesh in doc['meshes']:
            if mesh.get('name', '').startswith('IFF_'):
                continue
            old = next(m for m in original['meshes'] if m['name'] == mesh['name'])
            for p, op in zip(mesh['primitives'], old['primitives']):
                for key in p['attributes']:
                    a, oa = doc['accessors'][p['attributes'][key]], original['accessors'][op['attributes'][key]]
                    assert {k: v for k, v in a.items() if k != 'bufferView'} == {k: v for k, v in oa.items() if k != 'bufferView'}
                    assert view(doc, binary, a['bufferView']) == view(original, original_binary, oa['bufferView'])
        for i, oi in zip(doc['images'], original['images']):
            assert view(doc, binary, i['bufferView']) == view(original, original_binary, oi['bufferView'])
    print(f'PASS {faction}: exactly two small solid patches, valid offline GLB and unchanged original vehicle geometry/textures')
