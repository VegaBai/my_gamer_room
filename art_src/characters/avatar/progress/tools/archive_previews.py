"""Preserve historical preview images before the explicitly requested cleanup."""
import hashlib, json, re, shutil
from pathlib import Path
from PIL import Image

WORKSPACE = Path('C:/github2/gamer_room')
OUT = Path(__file__).resolve().parents[1]
ASSETS = [
 ('avatar-retextured.blend','贴图重绘'),('avatar-pbr.blend','材质与服装细化'),
 ('avatar-hair-strands.blend','发丝纹理'),('avatar-collar-corrected.blend','衣领修正'),
 ('avatar-platform-boots.blend','厚底靴'),('avatar-tassel-refined.blend','流苏细化'),
 ('avatar-anime-hair.blend','发型风格调整'),('avatar-collar-edges.blend','衣领边缘'),
 ('avatar-front-collar.blend','前领造型'),('avatar-collar-thickness.blend','衣领厚度'),
 ('avatar-collar-corners.blend','衣领转角'),('avatar-hair-flow-v12.blend','发流走向'),
 ('avatar-fitted-hair-v13.blend','头发贴合'),('avatar-poly-hair-v14.blend','发束结构'),
 ('avatar-soft-hair-v15.blend','头发柔化'),('avatar-brush-hair-v16.blend','发丝层次'),
 ('avatar-balanced-hair-v17.blend','发量平衡'),('avatar-pouch-clasp-v18.blend','荷包锁扣'),
 ('avatar-cord-clasp-v19.blend','锁扣与绳连接'),('avatar-clasp-lowpoly-v20.blend','锁扣简化'),
 ('avatar-clasp-alignment-v21.blend','锁扣对齐'),('avatar-clasp-angle-v22.blend','锁扣角度'),
 ('avatar-clasp-contact-v23.blend','锁扣接触'),('avatar-skirt-clearance-v24.blend','裙摆间隙'),
 ('avatar-skirt-review-v25.blend','裙摆复查'),('avatar-arm-surface-v26.blend','手臂表面修复'),
 ('avatar-leg-surface-v27.blend','腿部表面修复'),('avatar-body-surface-v28.blend','全身表面复查'),
]

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()

def main():
    versions=[]; inventory=[]
    for v,(asset,title) in enumerate(ASSETS,1):
        roots=[p for p in WORKSPACE.glob('tripo-retexture-v*') if re.match(r'^tripo-retexture-v'+str(v)+r'(?:-|$)',p.name)]
        assert len(roots)==1,(v,roots)
        root=roots[0]; model=root/asset; assert model.is_file(),model
        entry={'version':v,'title':title,'source_directory':root.name,'source_model':asset,'source_model_bytes':model.stat().st_size,'source_model_sha256':digest(model),'original_previews':[]}
        for src in sorted(root.rglob('*')):
            if not src.is_file():continue
            rel=src.relative_to(root)
            if v<=27:inventory.append({'path':src.relative_to(WORKSPACE).as_posix(),'bytes':src.stat().st_size})
            if src.suffix.lower() not in {'.png','.jpg','.jpeg','.webp'}:continue
            if rel.parts[0] not in {'renders','inspection'}:continue
            if re.search(r'mask|map-preview|^basecolor|^uv-|^island|^image-\d|projected-boundaries|skirt-sections|longitudinal-edge|pony-uv|dense-root',src.name):continue
            dst=OUT/f'v{v:02d}'/'original-previews'/rel
            dst.parent.mkdir(parents=True,exist_ok=True)
            if not dst.exists():shutil.copy2(src,dst)
            assert digest(src)==digest(dst),src
            with Image.open(dst) as im:im.verify()
            entry['original_previews'].append({'path':dst.relative_to(OUT).as_posix(),'source':rel.as_posix(),'bytes':dst.stat().st_size,'sha256':digest(dst)})
        versions.append(entry)
        print(f"ARCHIVED V{v:02d}: {len(entry['original_previews'])} previews",flush=True)
    (OUT/'index.json').write_text(json.dumps({'versions':versions,'note':'Original preview images retained byte-for-byte. Uniform full-body views rendered from each final source before removal; V28 retained.'},ensure_ascii=False,indent=2),encoding='utf-8')
    temp=WORKSPACE/'web/.tmp/avatar-iteration';temp.mkdir(parents=True,exist_ok=True)
    (temp/'deletion-inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
    print('OLD_VERSION_BYTES',sum(f['bytes'] for f in inventory),flush=True)

if __name__=='__main__':main()
