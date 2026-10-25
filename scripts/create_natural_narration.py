"""Generate two neural narrator choices while preserving approved music/visuals.

Requires edge-tts, numpy and ffmpeg. Only the public narration script is sent
to the speech service during this local build. Website visitors load static MP4s.
"""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import wave

import numpy as np
from add_demo_audio import NARRATION, ROOT, RATE, pcm, write_wav, stamp

BUILD=ROOT/'build/neural-narration'
VOICES={'male':'en-US-AndrewNeural','female':'en-US-EmmaNeural'}

async def synthesize(args,metadata):
    import edge_tts
    semaphore=asyncio.Semaphore(1)
    async def segment(key,index,text,style,seconds):
        folder=BUILD/style;folder.mkdir(parents=True,exist_ok=True)
        path=folder/f'{key}-{index}.mp3'
        async with semaphore:
            for rate in ['-3%','+3%','+8%','+12%']:
                cached=path.exists() and path.stat().st_size>100 and rate=='-3%'
                if not cached:
                    for attempt in range(3):
                        try:
                            await asyncio.wait_for(edge_tts.Communicate(text,VOICES[style],rate=rate).save(str(path)),30)
                            break
                        except (edge_tts.exceptions.NoAudioReceived,TimeoutError):
                            if attempt==2:raise
                            await asyncio.sleep(2+attempt*2)
                samples=pcm(args.ffmpeg,path)
                if len(samples)/RATE<=seconds-.24:
                    return (key,index,style,samples,'cached natural speech' if cached else rate)
            raise ValueError(f'Shorten {key} scene {index} for {style}; narration will not be cut or digitally sped up.')
    jobs=[]
    for info in metadata:
        key='social' if 'social' in info['file'] else 'walkthrough'
        for i,(chapter,text) in enumerate(zip(info['chapters'],NARRATION[key],strict=True)):
            for style in VOICES:jobs.append(segment(key,i,text,style,chapter['duration']))
    return await asyncio.gather(*jobs)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--ffmpeg',required=True)
    parser.add_argument('--tts-deps',type=Path)
    args=parser.parse_args()
    if args.tts_deps:sys.path.insert(0,str(args.tts_deps))
    BUILD.mkdir(parents=True,exist_ok=True)
    metadata_path=ROOT/'assets/video/demo-videos.json'
    metadata=json.loads(metadata_path.read_text(encoding='utf-8'))
    segments=asyncio.run(synthesize(args,metadata))
    sources={(key,index,style):(samples,rate) for key,index,style,samples,rate in segments}
    report=[]
    for info in metadata:
        key='social' if 'social' in info['file'] else 'walkthrough'
        default='female' if key=='social' else 'male'
        source=ROOT/'assets/video'/info['file']
        visual=BUILD/f'{key}-original-visual.mp4'
        shutil.copy2(source,visual)
        approved=BUILD/f'{key}-approved-background.wav'
        if not approved.exists():shutil.copy2(ROOT/f'build/demo-audio/{key}-background.wav',approved)
        original_hash=hashlib.sha256(approved.read_bytes()).hexdigest()
        with wave.open(str(approved),'rb') as f:
            if f.getframerate()!=RATE or f.getnchannels()!=2:raise ValueError('Unexpected approved soundtrack format')
            music=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(np.float32).reshape(-1,2)/32768
        if len(music)!=round(info['seconds']*RATE):raise ValueError('Music duration changed')
        variants={}
        for style in VOICES:
            narration=np.zeros(len(music),dtype=np.float32)
            for i,chapter in enumerate(info['chapters']):
                samples,rate=sources[(key,i,style)]
                edge=min(240,len(samples)//2)
                samples[:edge]*=np.linspace(0,1,edge);samples[-edge:]*=np.linspace(1,0,edge)
                offset=round((chapter['start']+.12)*RATE)
                narration[offset:offset+len(samples)]+=samples
                report.append({'video':key,'narrator':style,'scene':i,'duration':round(len(samples)/RATE,3),'native_rate':rate,'digital_time_stretch':False})
            mixed=BUILD/f'{key}-{style}-mix.wav'
            write_wav(mixed,narration[:,None]+music)
            name=info['file'] if style==default else f'keeperbma-{key}-{style}.mp4'
            output=BUILD/name
            subprocess.run([args.ffmpeg,'-y','-v','error','-i',str(visual),'-i',str(mixed),'-map','0:v:0','-map','1:a:0','-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-c:a','aac','-b:a','160k','-ar',str(RATE),'-t',str(info['seconds']),'-movflags','+faststart',str(output)],check=True)
            shutil.copy2(output,ROOT/'assets/video'/name)
            variants[style]={'file':name,'voice':VOICES[style],'label':'Warm male' if style=='male' else 'Friendly female'}
        info['audio']={'narration':'English neural synthetic narration','default_narrator':default,'variants':variants,'music':'Previously approved original instrumental, preserved from the published mix','approved_music_sha256':original_hash,'mix':'Narration-forward stereo AAC; no digital speech time stretching'}
        captions=['WEBVTT','']
        for chapter,text in zip(info['chapters'],NARRATION[key],strict=True):
            captions.extend([f"{stamp(chapter['start'])} --> {stamp(chapter['start']+chapter['duration'])}",text.replace('B M A','BMA').replace('C S V','CSV'),''])
        source.with_suffix('.vtt').write_text('\n'.join(captions),encoding='utf-8')
        if hashlib.sha256(approved.read_bytes()).hexdigest()!=original_hash:raise ValueError('Approved music was changed')
    metadata_path.write_text(json.dumps(metadata,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    (BUILD/'voice-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('Created four narrator variants. Approved instrumental and H.264 visuals preserved.',flush=True)
    print(json.dumps(report,indent=2),flush=True)

if __name__=='__main__':main()
