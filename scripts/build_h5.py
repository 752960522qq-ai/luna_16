#!/usr/bin/env python3
"""Build a TapTap H5 ZIP with one root folder containing index.html."""
import argparse
import json
import shutil
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True, help='TapTap H5 upload ZIP')
parser.add_argument('--version',default='1.0.1')
parser.add_argument('--directory', help='Keep unpacked files here for local preview')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
compat = json.loads((root / 'scripts' / 'h5-compatibility.json').read_text())
assert compat['storage_key'] == 'bf-profile-v1' and compat['root_folder'] == 'blindfire'
assert "KEY='bf-profile-v1'" in (root / 'app/src/main/assets/progress.js').read_text()
stage = Path(args.directory).resolve() if args.directory else root / 'build' / 'h5'
if stage.exists():
    shutil.rmtree(stage)
shutil.copytree(root / 'app' / 'src' / 'main' / 'assets', stage)
(stage / 'net-config.js').write_text("export const REMOTE_ENABLED=false;\nexport const REMOTE_ORIGIN='';\nexport const EDITION='h5';\n", encoding='utf-8')
index = stage / 'index.html'
text = index.read_text(encoding='utf-8')
text = text.replace('单人战术训练与安卓同网对战。', '横屏3D战术训练：手动驾驶、火炮弹道、无人机侦察与困难AI。')
text = text.replace('id="openLAN" class="lan-button"', 'id="openLAN" class="lan-button hidden"')
text = text.replace('第三人称战术对战', '第三人称战术训练')
text = text.replace('</head>', '<meta name="screen-orientation" content="landscape"><meta name="x5-orientation" content="landscape"><link rel="manifest" href="manifest.webmanifest"></head>')
text=text.replace('V1.0</','V'+args.version+'</')
index.write_text(text, encoding='utf-8')
(stage / 'version.json').write_text(json.dumps({'version':args.version,'edition':'locked','orientation':'landscape'},ensure_ascii=False),encoding='utf-8')
app=stage/'app.js'
code=app.read_text(encoding='utf-8')
code=code.replace('new URLSearchParams(location.search).get("fullUnlockTest") === "1"','false').replace('new URLSearchParams(location.search).get("infiniteCoins") === "1"','false')
app.write_text(code,encoding='utf-8')
(stage / 'manifest.webmanifest').write_text(json.dumps({'name':'飞棍来咯','short_name':'飞棍来咯','start_url':'./index.html','scope':'./','display':'fullscreen','orientation':'landscape','background_color':'#142720','theme_color':'#142720'}, ensure_ascii=False), encoding='utf-8')
output = Path(args.output).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
package_root = compat['root_folder']
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    folder = zipfile.ZipInfo(f'{package_root}/', date_time=(2026, 10, 3, 0, 0, 0))
    folder.external_attr = (0o40755 << 16) | 0x10
    archive.writestr(folder, b'')
    for file in sorted(stage.rglob('*')):
        if file.is_file():
            info = zipfile.ZipInfo(f'{package_root}/{file.relative_to(stage).as_posix()}', date_time=(2026, 10, 3, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, file.read_bytes())
assert output.stat().st_size < 300 * 1024 * 1024
print(f'H5 upload ZIP built: {output} ({output.stat().st_size} bytes); entry: {package_root}/index.html; preview: {stage}')
