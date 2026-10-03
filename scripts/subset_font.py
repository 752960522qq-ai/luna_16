#!/usr/bin/env python3
"""Regenerate the local Chinese UI font after text changes (requires fontTools)."""
from pathlib import Path
import argparse
from fontTools import subset
ap=argparse.ArgumentParser();ap.add_argument('font');args=ap.parse_args()
root=Path(__file__).resolve().parents[1];assets=root/'app/src/main/assets'
text=''.join(p.read_text() for p in assets.glob('*') if p.suffix in ['.js','.html','.css'] and p.name not in ['three.module.js','GLTFLoader.js','BufferGeometryUtils.js'])
text+=''.join(p.read_text() for p in (root/'app/src/main/java').rglob('*.java'))
options=subset.Options();options.flavor='woff';options.name_IDs=['*'];options.name_legacy=True
font=subset.load_font(args.font,options);s=subset.Subsetter(options=options);s.populate(text=text+''.join(chr(i) for i in range(32,127)));s.subset(font);subset.save_font(font,assets/'ui.woff',options)
print('Font regenerated:',(assets/'ui.woff').stat().st_size,'bytes')
