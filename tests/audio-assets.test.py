import json,hashlib,subprocess
from pathlib import Path
base=Path('app/src/main/assets/audio'); manifest=json.loads((base/'SOURCES.json').read_text())
assert len(manifest['clips'])==15
for entry in manifest['clips']:
 p=base/entry['file'];assert hashlib.sha256(p.read_bytes()).hexdigest()==entry['sha256'];assert entry['license'] in ['CC0-1.0','CC-BY-3.0','CC-BY-4.0'];assert p.stat().st_size>1000
 # Ogg header and bounded source slice ensure we do not ship long firing/start sequences.
 assert p.read_bytes().startswith(b'OggS');assert 0<entry['slice_seconds']<=6
 if not entry['loop']:assert entry['slice_seconds']<=1.7
assert sum(p.stat().st_size for p in base.glob('*.ogg'))<400000
print('PASS 15 recorded asset clips, source/license hashes, short event slicing and compressed loop budgets')
