"""Blender background: render aligned views without saving/modifying any source."""
import bpy,json,sys,math
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parents[1]
WORKSPACE=Path('C:/github2/gamer_room')
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
selected={int(v) for v in args} if args else set(range(1,29))
VIEWS=[('front',(0,-1,0)),('front-left',(.7,-1,0)),('left',(1,0,0)),('back-left',(.7,1,0)),('back',(0,1,0)),('back-right',(-.7,1,0)),('right',(-1,0,0)),('front-right',(-.7,-1,0))]
for item in json.loads((OUT/'index.json').read_text(encoding='utf-8'))['versions']:
    v=item['version']
    if v not in selected:continue
    dest=OUT/f'v{v:02d}'/'views';dest.mkdir(parents=True,exist_ok=True)
    if all((dest/f'{name}.png').is_file() for name,_ in VIEWS):
        print(f'SKIP_COMPLETE V{v:02d}',flush=True);continue
    source=WORKSPACE/item['source_directory']/item['source_model']
    bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False)
    s=bpy.context.scene;s.render.engine='BLENDER_EEVEE'
    s.render.resolution_percentage=100;s.render.resolution_x=850;s.render.resolution_y=1000
    s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
    s.render.film_transparent=False;s.use_nodes=False
    s.render.use_sequencer=False;s.render.use_compositing=False
    s.view_settings.view_transform='Standard';s.view_settings.look='None';s.view_settings.exposure=-.25;s.view_settings.gamma=1
    world=bpy.data.worlds.new('Iteration review studio');s.world=world;world.use_nodes=True
    tree=world.node_tree;bg=tree.nodes['Background']
    env=tree.nodes.new('ShaderNodeTexEnvironment')
    env.image=bpy.data.images.load('C:/Program Files/Blender Foundation/Blender 5.2/5.2/datafiles/studiolights/world/forest.exr')
    tree.links.new(env.outputs['Color'],bg.inputs['Color']);bg.inputs['Strength'].default_value=1
    plain=tree.nodes.new('ShaderNodeBackground');plain.inputs['Color'].default_value=(.055,.055,.055,1)
    ray=tree.nodes.new('ShaderNodeLightPath');mix=tree.nodes.new('ShaderNodeMixShader')
    tree.links.new(ray.outputs['Is Camera Ray'],mix.inputs[0]);tree.links.new(bg.outputs[0],mix.inputs[1]);tree.links.new(plain.outputs[0],mix.inputs[2]);tree.links.new(mix.outputs[0],tree.nodes['World Output'].inputs[0])
    for ob in bpy.data.objects:
        if ob.type=='LIGHT':ob.hide_render=True
    s.eevee.taa_render_samples=96
    camera=bpy.data.cameras.new('Iteration review camera');cam=bpy.data.objects.new('Iteration review camera',camera);s.collection.objects.link(cam);s.camera=cam
    camera.type='ORTHO';camera.ortho_scale=1.08;camera.clip_start=.001;camera.clip_end=100
    focus=Vector((0,0,.5))
    missing=[]
    for im in bpy.data.images:
        if im.source=='FILE' and im.users and not im.packed_file and not Path(bpy.path.abspath(im.filepath)).is_file():missing.append(im.filepath)
    if missing:raise RuntimeError(f'Missing external images in V{v}: {missing}')
    for name,vector in VIEWS:
        if (dest/f'{name}.png').is_file():continue
        cam.location=focus+Vector(vector);cam.rotation_euler=(focus-cam.location).to_track_quat('-Z','Y').to_euler()
        s.render.filepath=str(dest/f'{name}.png');bpy.ops.render.render(write_still=True)
        print(f'ITERATION_SHOT V{v:02d} {name}',flush=True)
    print(f'VERSION_COMPLETE V{v:02d}',flush=True)
