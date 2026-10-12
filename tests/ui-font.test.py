from pathlib import Path
from fontTools.ttLib import TTFont
assets=Path('app/src/main/assets');font=TTFont(assets/'ui.woff');characters=set(''.join(p.read_text()for p in assets.glob('*')if p.suffix in ['.js','.html','.css'] and p.name not in ['three.module.js','GLTFLoader.js','BufferGeometryUtils.js']));cmap=font.getBestCmap();missing=sorted(c for c in characters if '\u4e00'<=c<='\u9fff' and ord(c) not in cmap);assert not missing,''.join(missing)
print('PASS all current Chinese UI/vehicle/crew/research glyphs embedded in offline font')
