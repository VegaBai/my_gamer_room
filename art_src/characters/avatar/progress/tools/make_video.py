"""Compose the synchronized eight-view iteration video from archived PNGs."""
import argparse, hashlib, json, subprocess, sys
from pathlib import Path
from PIL import Image

OUT=Path(__file__).resolve().parents[1]
TEMP=OUT.parents[3]/'.tmp/avatar-iteration'
RUNTIME=OUT.parents[3]/'.tools/iteration-video-runtime'
sys.path.insert(0,str(RUNTIME))
import imageio_ffmpeg
VIEWS=[('front','正面'),('front-left','左前'),('left','左侧'),('back-left','左后'),('back','背面'),('back-right','右后'),('right','右侧'),('front-right','右前')]
W,H=3840,2160
SECONDS_PER_VERSION=1

def frame(item):
    v=item['version']
    background=Image.open(OUT/f'v{v:02d}/views/front.png').convert('RGB').getpixel((0,0))
    im=Image.new('RGB',(W,H),background)
    cw,ch=W//4,H//2
    for i,(name,_) in enumerate(VIEWS):
        x=cw*(i%4);y=ch*(i//4)
        src=Image.open(OUT/f'v{v:02d}'/'views'/f'{name}.png').convert('RGB')
        scale=min(cw/src.width,ch/src.height)
        src=src.resize((round(src.width*scale),round(src.height*scale)),Image.Resampling.LANCZOS)
        im.paste(src,(x+(cw-src.width)//2,y+(ch-src.height)//2))
    return im

def main():
    p=argparse.ArgumentParser();p.add_argument('--frames-only',action='store_true');p.add_argument('--versions',nargs='*',type=int);a=p.parse_args()
    items=json.loads((OUT/'index.json').read_text(encoding='utf-8'))['versions']
    frames=TEMP/'frames';frames.mkdir(parents=True,exist_ok=True)
    for item in items:
        if a.versions and item['version'] not in a.versions:continue
        output=frames/f"v{item['version']:02d}.png"
        frame(item).save(output,optimize=True)
        print('FRAME',output.name,flush=True)
    if a.versions or a.frames_only:return
    # An overview for checking framing in every version without playing the video.
    background=Image.open(OUT/'v28/views/front.png').convert('RGB').getpixel((0,0))
    sheet=Image.new('RGB',(2240,1680),background)
    for i,item in enumerate(items):
        v=item['version'];src=Image.open(OUT/f'v{v:02d}/views/front.png').convert('RGB');src.thumbnail((320,420),Image.Resampling.LANCZOS)
        x=(i%7)*320;y=(i//7)*420
        sheet.paste(src,(x+(320-src.width)//2,y+(420-src.height)//2))
    sheet.save(OUT/'all-versions-overview.jpg',quality=92)
    Image.open(frames/'v28.png').save(OUT/'video-poster.jpg',quality=94)
    concat=TEMP/'frames.ffconcat'
    content=['ffconcat version 1.0']
    for item in items:
        png=frames/('v%02d.png' % item['version'])
        content += [f"file '{png.as_posix()}'",f'duration {SECONDS_PER_VERSION}']
    content.append(f"file '{(frames/'v28.png').as_posix()}'")
    concat.write_text('\n'.join(content)+'\n',encoding='utf-8')
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    duration=len(items)*SECONDS_PER_VERSION
    target=OUT/'avatar-iterations-v01-v28-clean-1s-4k.mp4'
    cmd=[ffmpeg,'-y','-hide_banner','-loglevel','warning','-f','concat','-safe','0','-i',str(concat),'-vf','fps=30','-t',str(duration),'-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(target)]
    print('ENCODING 4K',flush=True);subprocess.run(cmd,check=True)
    small=OUT/'avatar-iterations-v01-v28-clean-1s-1080p.mp4'
    print('ENCODING 1080P',flush=True)
    subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','warning','-i',str(target),'-vf','scale=1920:1080','-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(small)],check=True)
    decoded={}
    for movie in [target,small]:
        check=subprocess.run([ffmpeg,'-v','error','-i',str(movie),'-progress','pipe:1','-nostats','-f','null','-'],check=True,capture_output=True,text=True)
        fields={}
        for line in check.stdout.splitlines():
            if '=' in line:
                k,value=line.split('=',1);fields[k]=value
        assert int(fields['frame'])==duration*30,(movie,fields)
        assert abs(int(fields['out_time_us'])/1e6-duration)<.05,(movie,fields)
        decoded[movie.name]={'frames':int(fields['frame']),'duration_seconds':int(fields['out_time_us'])/1e6}
        print('VIDEO_DECODE_OK',movie.name,movie.stat().st_size,flush=True)
    result={'duration_seconds':duration,'seconds_per_version':SECONDS_PER_VERSION,'fps':30,'versions':28,'views':8,'layout':'borderless 4x2; characters only; no text or timeline','video_files':[]}
    for movie in [target,small]:result['video_files'].append({'path':movie.name,'bytes':movie.stat().st_size,'sha256':hashlib.sha256(movie.read_bytes()).hexdigest(),**decoded[movie.name]})
    (OUT/'video-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')

if __name__=='__main__':main()
