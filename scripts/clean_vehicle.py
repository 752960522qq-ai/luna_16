#!/usr/bin/env python3
"""Keep the supplied vehicle and its textures, replacing IFF add-ons with two small door patches."""
import argparse, copy, json, struct
from pathlib import Path


def clean(source, destination, faction):
    raw = Path(source).read_bytes()
    magic, version, total = struct.unpack_from('<III', raw)
    assert magic == 0x46546c67 and version == 2 and total == len(raw)
    length, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4e4f534a
    doc = json.loads(raw[20:20 + length])
    binary = raw[28 + length:]
    nodes = doc['nodes']
    keep = [i for i, n in enumerate(nodes) if not n.get('name', '').startswith('IFF_') or '_door_core_' in n.get('name', '')]
    node_map = {old: new for new, old in enumerate(keep)}
    doc['nodes'] = [copy.deepcopy(nodes[i]) for i in keep]
    for n in doc['nodes']:
        if 'children' in n:
            n['children'] = [node_map[i] for i in n['children'] if i in node_map]
        if n.get('name', '').startswith('IFF_'):
            side = 'left' if n['name'].endswith('_-1') else 'right'
            position = doc['meshes'][n['mesh']]['primitives'][0]['attributes']['POSITION']
            acc = doc['accessors'][position]
            center = [(a + b) / 2 for a, b in zip(acc['min'], acc['max'])]
            scale = [.42, 1, .12]
            n['name'] = f'IFF_{faction}_solid_{side}'
            n['matrix'] = [scale[0], 0, 0, 0, 0, scale[1], 0, 0, 0, 0, scale[2], 0,
                           center[0] * (1 - scale[0]), center[1] * (1 - scale[1]), center[2] * (1 - scale[2]), 1]
    for scene in doc['scenes']:
        scene['nodes'] = [node_map[i] for i in scene['nodes'] if i in node_map]

    mesh_ids = sorted({n['mesh'] for n in doc['nodes'] if 'mesh' in n})
    mesh_map = {old: new for new, old in enumerate(mesh_ids)}
    doc['meshes'] = [doc['meshes'][i] for i in mesh_ids]
    for n in doc['nodes']:
        if 'mesh' in n: n['mesh'] = mesh_map[n['mesh']]
    material_ids = sorted({p['material'] for m in doc['meshes'] for p in m['primitives']})
    material_map = {old: new for new, old in enumerate(material_ids)}
    doc['materials'] = [doc['materials'][i] for i in material_ids]
    for m in doc['materials']:
        if m.get('name', '').startswith('IFF_'):
            m.clear()
            m.update(name=f'IFF_{faction.upper()}_SOLID', pbrMetallicRoughness={
                'baseColorFactor': [0, 0, 1, 1] if faction == 'friendly' else [1, 0, 0, 1],
                'metallicFactor': 0, 'roughnessFactor': 1})
    accessor_ids = set()
    for m in doc['meshes']:
        for p in m['primitives']:
            p['material'] = material_map[p['material']]
            accessor_ids.update(p['attributes'].values())
            if 'indices' in p: accessor_ids.add(p['indices'])
    accessor_ids = sorted(accessor_ids)
    accessor_map = {old: new for new, old in enumerate(accessor_ids)}
    doc['accessors'] = [doc['accessors'][i] for i in accessor_ids]
    for m in doc['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: accessor_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] = accessor_map[p['indices']]
    views = doc['bufferViews']
    view_ids = sorted({a['bufferView'] for a in doc['accessors']} | {i['bufferView'] for i in doc.get('images', [])})
    view_map = {old: new for new, old in enumerate(view_ids)}
    output = bytearray(); new_views = []
    for i in view_ids:
        v = copy.deepcopy(views[i]); start = v.get('byteOffset', 0)
        while len(output) % 4: output.append(0)
        v['byteOffset'] = len(output); v['buffer'] = 0
        output.extend(binary[start:start + v['byteLength']]); new_views.append(v)
    doc['bufferViews'] = new_views
    for a in doc['accessors']: a['bufferView'] = view_map[a['bufferView']]
    for image in doc.get('images', []): image['bufferView'] = view_map[image['bufferView']]
    doc['buffers'] = [{'byteLength': len(output)}]
    doc['asset']['generator'] = 'Blindfire vehicle IFF cleanup; original vehicle geometry and textures retained'
    doc.setdefault('extras', {}).update(iffPatches=2, forwardAxis='+X', role=faction)
    payload = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
    payload += b' ' * (-len(payload) % 4)
    output += b'\0' * (-len(output) % 4)
    result = struct.pack('<III', magic, 2, 28 + len(payload) + len(output))
    result += struct.pack('<II', len(payload), 0x4e4f534a) + payload
    result += struct.pack('<II', len(output), 0x004e4942) + output
    target = Path(destination); target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(result)
    print(f'{target.name}: {len(result)} bytes, two solid {"blue" if faction == "friendly" else "red"} patches')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source'); parser.add_argument('destination'); parser.add_argument('--faction', choices=['friendly', 'enemy'], required=True)
    args = parser.parse_args(); clean(args.source, args.destination, args.faction)
