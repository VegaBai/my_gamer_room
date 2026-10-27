"""Check that deleting V01-V27 will not remove a live V28 dependency."""
import bpy,json,re
from pathlib import Path
OUT=Path(__file__).resolve().parents[1]
root=Path('C:/github2/gamer_room')
bpy.ops.wm.open_mainfile(filepath=str(root/'tripo-retexture-v28-body-surface/avatar-body-surface-v28.blend'),load_ui=False)
images=[];problems=[]
for im in bpy.data.images:
    if im.source!='FILE' or not im.users:continue
    path=Path(bpy.path.abspath(im.filepath));packed=bool(im.packed_file)
    old=any(re.match(r'^tripo-retexture-v(?:[1-9]|1\d|2[0-7])(?:-|$)',p) for p in path.parts)
    images.append({'name':im.name,'packed':packed,'references_old_version':old})
    if not packed and (old or not path.is_file()):problems.append(im.name)
for lib in bpy.data.libraries:
    path=Path(bpy.path.abspath(lib.filepath))
    if any(re.match(r'^tripo-retexture-v(?:[1-9]|1\d|2[0-7])(?:-|$)',p) for p in path.parts):problems.append(lib.filepath)
assert not problems,problems
(OUT/'v28-dependency-verification.json').write_text(json.dumps({'passed':True,'images':images,'linked_libraries':len(bpy.data.libraries)},indent=2),encoding='utf-8')
print('V28_STANDALONE_OK',len(images),'images; no live dependencies on V01-V27',flush=True)
