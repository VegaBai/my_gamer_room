"""Gate cleanup on complete previews, verified source copies and decoded videos."""
import argparse,hashlib,json
from pathlib import Path
import numpy as np
from PIL import Image
OUT=Path(__file__).resolve().parents[1]
WORKSPACE=Path('C:/github2/gamer_room')
VIEWS=['front','front-left','left','back-left','back','back-right','right','front-right']

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(2**20),b''):h.update(b)
    return h.hexdigest()

parser=argparse.ArgumentParser();parser.add_argument('--after-cleanup',action='store_true');args=parser.parse_args()
index=json.loads((OUT/'index.json').read_text(encoding='utf-8'))
assert [v['version'] for v in index['versions']]==list(range(1,29))
new_views=[];originals=0
for version in index['versions']:
    v=version['version']
    model=WORKSPACE/version['source_directory']/version['source_model']
    if model.exists() or not args.after_cleanup:assert sha(model)==version['source_model_sha256'],model
    for item in version['original_previews']:
        dst=OUT/item['path'];src=WORKSPACE/version['source_directory']/item['source']
        assert sha(dst)==item['sha256'],(v,dst)
        if src.exists() or not args.after_cleanup:assert sha(src)==item['sha256'],(v,src)
        with Image.open(dst) as im:im.verify()
        originals+=1
    for angle in VIEWS:
        path=OUT/f'v{v:02d}'/'views'/f'{angle}.png'
        with Image.open(path) as im:
            assert im.size==(850,1000),(v,angle,im.size)
            a=np.asarray(im.convert('RGB')).astype(np.int16)
        background=np.median(a[:10,:10],axis=(0,1))
        foreground=np.max(np.abs(a-background),axis=2)>28
        y,x=np.where(foreground)
        assert len(x)>10000,(v,angle,'blank render')
        box=[int(x.min()),int(y.min()),int(x.max()),int(y.max())]
        assert box[0]>3 and box[1]>3 and box[2]<846 and box[3]<996,(v,angle,'possible clipping',box)
        new_views.append({'version':v,'view':angle,'path':path.relative_to(OUT).as_posix(),'sha256':sha(path),'bytes':path.stat().st_size,'foreground_bbox':box})
video=json.loads((OUT/'video-verification.json').read_text())
assert video['duration_seconds']==28 and video['seconds_per_version']==1 and video['versions']==28 and video['views']==8
for f in video['video_files']:assert sha(OUT/f['path'])==f['sha256']
assert sha(WORKSPACE/'tripo-retexture-v28-body-surface/avatar-body-surface-v28.blend')=='7d367b71384f170433ca55550ba50b4f48af87bf8e01a1c4aaa0b37df227ac21'
assert sha(OUT.parent/'v28/avatar-body-surface-v28.blend')=='7d367b71384f170433ca55550ba50b4f48af87bf8e01a1c4aaa0b37df227ac21'
report={'passed':True,'after_cleanup':args.after_cleanup,'original_previews_verified':originals,'old_version_previews_verified':sum(len(v['original_previews']) for v in index['versions'][:27]),'standard_views_verified':len(new_views),'v28_model_unchanged':True,'standard_views':new_views}
(OUT/('archive-verification-after-cleanup.json' if args.after_cleanup else 'archive-verification.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('ARCHIVE VERIFIED:',originals,'original previews,',len(new_views),'aligned views, both videos, V28 unchanged',flush=True)
