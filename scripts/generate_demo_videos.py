"""Render captioned visual tracks from fictional demo screenshots.

Run capture_demo_video.cjs first. Requires Pillow and an ffmpeg with libx264.
Use --ffmpeg /path/to/ffmpeg when it is not on PATH.
After rendering, run add_demo_audio.py to build the instrumental stems, then
create_natural_narration.py for the current two-voice narration release.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SCENES = [
    ('intro', 5, 'Your business.\nOne workspace.', 'A guided look at KeeperBMA’s interactive demo.', 'Explore freely. Fictional data resets on refresh.'),
    ('overview', 6, 'Start with\na clear overview.', 'Choose POS, Team, Finance or Marketing. Focus on one task at a time.', 'Step 1 · Choose your workspace'),
    ('products', 6, 'Organize\nyour products.', 'Try products, brands, categories, CSV imports and supplier purchases.', 'Step 2 · Build your sample inventory'),
    ('checkout', 7, 'Sign in.\nRing up a sale.', 'Choose a demo cashier, add products and select a saved customer or walk-in.', 'Step 3 · Staff sign-in is a simulation, not secure authentication'),
    ('receipt', 6, 'Keep the sale\nconnected.', 'The sample receipt records the cashier, customer, total and earned points.', 'Jason · $25.00 sample sale · 25 points earned'),
    ('schedule', 7, 'Plan your team\nby branch.', 'Assign Jason and Kay to Monday’s 9 AM–2 PM shift and review planned hours.', 'Step 4 · Scheduling does not clock staff in'),
    ('time', 6, 'Track time.\nReview hours.', 'Try clock-in, unpaid breaks, clock-out and gross-pay estimates.', 'Sample estimates only · No payroll payments or tax withholding'),
    ('loyalty', 7, 'Bring customers\nback with points.', 'Optional phone membership, purchase history and owner-adjustable rewards.', '100 points = $1 by default · Phone verification and SMS are not connected'),
    ('accounting', 7, 'See the numbers\ntogether.', 'Review sales, discounts, product costs, expenses and tax collected.', 'Accounting overview only · Not complete bookkeeping or tax filing'),
    ('marketing', 6, 'Plan your\nnext campaign.', 'Keep campaign notes, customer follow-ups and sharing drafts in the same demo.', 'No automatic messages, social posts or ad purchases'),
    ('personal', 6, 'Personal finance\nis here too.', 'Explore sample income, expenses and monthly reports for your side hustle.', 'Fictional records only · No real bank connection'),
    ('cta', 5, 'Try it yourself.', 'No signup needed. Explore the demo and tell us what would help your work.', 'www.keeperbma.com/demo.html'),
]
SOCIAL = [(SCENES[i][0], seconds, *SCENES[i][2:]) for i, seconds in [(0,3),(3,5),(4,4),(5,4),(7,5),(8,4),(11,4)]]

def font(size, bold=False):
    candidates = [Path('C:/Windows/Fonts') / ('segoeuib.ttf' if bold else 'segoeui.ttf'), Path('/usr/share/fonts/truetype/dejavu') / ('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')]
    return ImageFont.truetype(str(next(p for p in candidates if p.exists())), size)

def wrapped(text, width, face):
    lines = []
    for paragraph in text.split('\n'):
        line = ''
        for word in paragraph.split():
            trial = (line + ' ' + word).strip()
            if face.getlength(trial) > width and line:
                lines.append(line)
                line = word
            else:
                line = trial
        lines.append(line)
    return '\n'.join(lines)

def timestamp(seconds):
    ms = round(seconds * 1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'

def build(scenes, vertical, args):
    width, height = (720,1280) if vertical else (1280,720)
    prefix = 'keeperbma-social' if vertical else 'keeperbma-walkthrough'
    output = args.output / (prefix+'.mp4')
    total = sum(s[1] for s in scenes)
    background = Image.new('RGB',(width,height),'#0d1425')
    d=ImageDraw.Draw(background)
    for y in range(height):
        v=y/height
        d.line((0,y,width,y), fill=(13+int(v*6),20+int(v*9),37+int(v*18)))
    d.ellipse((width-460,-180,width+260,540),fill='#192447')
    d.ellipse((-260,height-260,400,height+400),fill='#17213c')
    icon=Image.open(ROOT/'assets/keeperbma-icon.png').convert('RGBA').resize((38,38),Image.Resampling.LANCZOS)
    background.paste(icon,(40,35),icon)
    d=ImageDraw.Draw(background)
    d.text((90,38),'KeeperBMA',font=font(25,True),fill='white')
    d.rounded_rectangle((width-192,38,width-40,73),radius=17,fill='#2c375a')
    d.text((width-175,44),'DEMO PREVIEW',font=font(15,True),fill='#c9d2ff')
    images={}
    for key,*_ in scenes:
        path=args.screens/(key+'.png')
        if path.exists():
            im=Image.open(path).convert('RGB')
            if im.width==1440:
                im=im.crop((308,100,1348,950))
            images[key]=im
    def scene_frame(scene, progress):
        key,duration,title,subtitle,caption=scene
        image=background.copy();draw=ImageDraw.Draw(image)
        intro=key in ('intro','cta')
        shift=int(16*(1-min(progress*5,1))**2)
        if intro:
            x=48 if vertical else 80; y=(225 if vertical else 205)+shift
            face=font(66 if vertical else 64,True)
            draw.multiline_text((x,y),wrapped(title,width-x*2,face),font=face,fill='white',spacing=8)
            subface=font(30 if vertical else 27)
            draw.multiline_text((x,y+(210 if vertical else 175)),wrapped(subtitle,width-x*2-(0 if vertical else 240),subface),font=subface,fill='#bec9e4',spacing=10)
            if vertical:
                for i,label in enumerate(['POS & inventory','Staff & branches','Customers & loyalty','Connected reports']):
                    yy=650+i*75
                    draw.rounded_rectangle((48,yy,width-48,yy+58),radius=12,fill='#223055')
                    draw.text((70,yy+12),label,font=font(25,True),fill='#e2e7ff')
            else:
                draw.rounded_rectangle((80,520,1010,575),radius=12,fill='#223055')
                draw.text((105,532),'POS   /   TEAM   /   LOYALTY   /   REPORTS',font=font(24,True),fill='#d5ddff')
        else:
            x=48; y=(140 if vertical else 150)+shift
            titleface=font(56 if vertical else 45,True)
            draw.multiline_text((x,y),wrapped(title,624 if vertical else 435,titleface),font=titleface,fill='white',spacing=5)
            sf=font(27 if vertical else 23)
            sy=y+(170 if vertical else 165)
            draw.multiline_text((x,sy),wrapped(subtitle,624 if vertical else 425,sf),font=sf,fill='#bec9e4',spacing=9)
            bounds=(40,490,680,1030) if vertical else (520,128,1240,600)
            bx,by,ex,ey=bounds
            draw.rounded_rectangle((bx-3,by-3,ex+3,ey+3),radius=17,fill='#3b496c')
            screen=Image.new('RGB',(ex-bx,ey-by),'#f4f6fa')
            src=images[key]
            scale=1+0.018*progress
            fitted=ImageOps.contain(src,(round(screen.width*scale),round((screen.height-26)*scale)),Image.Resampling.LANCZOS)
            screen.paste(fitted,((screen.width-fitted.width)//2,26+(screen.height-26-fitted.height)//2))
            sd=ImageDraw.Draw(screen);sd.rectangle((0,0,screen.width,26),fill='#e3e8f2');sd.text((12,4),'keeperbma.com · fictional demo',font=font(13),fill='#52617d')
            mask=Image.new('L',screen.size);ImageDraw.Draw(mask).rounded_rectangle((0,0,screen.width-1,screen.height-1),radius=14,fill=255)
            image.paste(screen,(bx,by),mask)
        draw=ImageDraw.Draw(image)
        capfont=font(24 if vertical else 19,True)
        cap=wrapped(caption,width-96,capfont)
        draw.multiline_text((48,1100 if vertical else 635),cap,font=capfont,fill='#dce4ff',spacing=7)
        if vertical:
            draw.text((48,1215),'keeperbma.com  /  Try the demo',font=font(21),fill='#9fb0d2')
        draw.text((width-85,height-36),f'{int(progress*duration):02}s',font=font(14),fill='#8b9dbf')
        return image
    args.output.mkdir(parents=True,exist_ok=True)
    scene_frame(scenes[0],0.5).save(args.output/(prefix+'-poster.jpg'),quality=90)
    cmd=[args.ffmpeg,'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}','-r',str(args.fps),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',str(output)]
    process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    elapsed=0;previous=None;vtt=['WEBVTT',''];chapters=[]
    try:
        for scene in scenes:
            key,duration,title,subtitle,caption=scene
            chapters.append({'start':elapsed,'title':title.replace('\n',' '),'duration':duration})
            vtt.extend([f'{timestamp(elapsed)} --> {timestamp(elapsed+duration)}',title.replace('\n',' ')+' '+subtitle+' '+caption,''])
            for frame in range(round(duration*args.fps)):
                local=frame/args.fps;p=local/duration
                image=scene_frame(scene,p)
                if previous is not None and local<0.35:
                    image=Image.blend(previous,image,local/0.35)
                draw=ImageDraw.Draw(image)
                draw.rectangle((0,height-5,round(width*(elapsed+local)/total),height),fill='#9faaff')
                process.stdin.write(image.tobytes())
                if frame==round(duration*args.fps)-1:previous=image
            elapsed+=duration
            print(prefix+': '+key+' / '+str(elapsed)+'s',flush=True)
    finally:
        process.stdin.close()
    if process.wait()!=0:raise RuntimeError('Video encoding failed')
    (args.output/(prefix+'.vtt')).write_text('\n'.join(vtt),encoding='utf-8')
    return {'file':output.name,'width':width,'height':height,'seconds':total,'chapters':chapters}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--ffmpeg',default=shutil.which('ffmpeg'))
    parser.add_argument('--screens',type=Path,default=ROOT/'build/demo-video')
    parser.add_argument('--output',type=Path,default=ROOT/'assets/video')
    parser.add_argument('--fps',type=int,default=24)
    args=parser.parse_args()
    if not args.ffmpeg:raise SystemExit('Provide --ffmpeg with libx264 support')
    results=[build(SCENES,False,args),build(SOCIAL,True,args)]
    (args.output/'demo-videos.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(results),flush=True)

if __name__=='__main__':main()
