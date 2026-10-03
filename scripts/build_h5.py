#!/usr/bin/env python3
"""Build a TapTap H5 ZIP with one root folder containing index.html."""
import argparse
import shutil
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True, help='TapTap H5 upload ZIP')
parser.add_argument('--directory', help='Keep unpacked files here for local preview')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
stage = Path(args.directory).resolve() if args.directory else root / 'build' / 'h5'
if stage.exists():
    shutil.rmtree(stage)
shutil.copytree(root / 'app' / 'src' / 'main' / 'assets', stage)
(stage / 'net-config.js').write_text("export const REMOTE_ENABLED=false;\nexport const REMOTE_ORIGIN='';\nexport const EDITION='h5';\n", encoding='utf-8')
index = stage / 'index.html'
text = index.read_text(encoding='utf-8')
text = text.replace('单人战术训练与安卓同网对战。', '竖屏3D战术训练：手动驾驶、火炮弹道、无人机侦察与困难AI。')
text = text.replace('id="openLAN" class="lan-button"', 'id="openLAN" class="lan-button hidden"')
text = text.replace('第三人称战术对战', '第三人称战术训练')
index.write_text(text, encoding='utf-8')
output = Path(args.output).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
package_root = 'blindfire'
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
print(f'H5 upload ZIP built: {output} ({output.stat().st_size} bytes); entry: {package_root}/index.html; preview: {stage}')
