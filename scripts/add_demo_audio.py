"""Add scene-aligned English narration and an original instrumental bed.

Legacy local-voice fallback and instrumental-stem builder. For the current
two neural narrator choices, run create_natural_narration.py afterward.
Windows speech synthesis runs locally. Requires numpy and ffmpeg with AAC.
No speech, music, account or messaging service is called.
"""
import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess
import wave

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'build' / 'demo-audio'
RATE = 48000
NARRATION = {
    'walkthrough': [
        'Welcome to Keeper B M A. Explore your business in one workspace.',
        'Start with your overview. Choose point of sale, team, finance, or marketing.',
        'Add products and prices. Import your catalog and receive supplier purchases.',
        'Sign in as a demo cashier. Add products and choose a customer or walk-in. Payments here are simulated.',
        'See the cashier, customer, total, and points earned on each sample receipt.',
        'Plan each branch’s shifts. Assign Jason and Kay to Monday, nine to two, and review planned hours.',
        'Track hours, breaks, and gross pay estimates. No payroll payments are made.',
        'Preview phone membership and adjustable customer rewards. No real texts are sent.',
        'Review sales, costs, expenses, and tax collected. This is not full bookkeeping or tax filing.',
        'Plan campaigns, meetings, tasks, and follow ups. Nothing is posted or sent.',
        'Explore personal income, expenses, and monthly reports with fictional sample records.',
        'Try the demo at keeper B M A dot com. No signup needed.',
    ],
    'social': [
        'Keeper B M A.',
        'Sign in as a demo cashier. Add products and choose your customer.',
        'See the cashier, sale total, and points.',
        'Plan staff shifts for each branch.',
        'Preview phone membership and rewards. No real texts are sent.',
        'Explore reports. Full bookkeeping is not connected.',
        'Try the demo at keeper B M A dot com.',
    ],
}

def stamp(seconds):
    ms = round(seconds*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'

def write_wav(path, samples):
    pcm = np.clip(samples*32767,-32768,32767).astype('<i2')
    with wave.open(str(path),'wb') as f:
        f.setnchannels(samples.shape[1] if samples.ndim>1 else 1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(pcm.tobytes())

def synthesize(jobs, voice):
    plan = BUILD/'narration-jobs.json'
    plan.write_text(json.dumps(jobs,ensure_ascii=False),encoding='utf-8')
    script = BUILD/'synthesize.ps1'
    script.write_text('''param([string]$Plan,[string]$VoiceName)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $speaker.SelectVoice($VoiceName)
  $speaker.Rate = 0
  $speaker.Volume = 100
  $jobs = [System.IO.File]::ReadAllText($Plan,[System.Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($job in $jobs) {
    $speaker.SetOutputToWaveFile($job.path)
    $speaker.Speak($job.text)
    $speaker.SetOutputToNull()
  }
} finally { $speaker.Dispose() }
''',encoding='utf-8-sig')
    subprocess.run(['powershell.exe','-NoProfile','-File',str(script),'-Plan',str(plan),'-VoiceName',voice],check=True)

def music(seconds):
    """A quiet original major-key pad and arpeggio; no samples or recordings."""
    length = round(seconds*RATE)
    sound = np.zeros((length,2),dtype=np.float32)
    beat = 60/88
    chords = [(48,55,60,64),(45,52,57,60),(41,48,53,57),(43,50,55,59)]
    for index,start in enumerate(np.arange(0,seconds,beat*4)):
        chord=chords[index%len(chords)]
        count=min(round(beat*4.4*RATE),length-round(start*RATE))
        t=np.arange(count,dtype=np.float32)/RATE
        env=np.minimum(t/.25,1)*np.minimum((count/RATE-t)/.5,1)
        for k,note in enumerate(chord):
            frequency=440*2**((note-69)/12)
            tone=(np.sin(2*math.pi*frequency*t)+.15*np.sin(2*math.pi*frequency*2*t))*.010*env
            offset=round(start*RATE)
            sound[offset:offset+count,0]+=tone*(.8 if k%2 else 1)
            sound[offset:offset+count,1]+=tone*(1 if k%2 else .8)
        for k in range(8):
            onset=start+k*beat/2
            offset=round(onset*RATE)
            count2=min(round(beat*2*RATE),length-offset)
            if count2<=0:continue
            tt=np.arange(count2,dtype=np.float32)/RATE
            frequency=440*2**((chord[k%4]+24-69)/12)
            envelope=(1-np.exp(-tt*90))*np.exp(-tt*4.5)
            pluck=(np.sin(2*math.pi*frequency*tt)+.10*np.sin(2*math.pi*frequency*2*tt))*.014*envelope
            sound[offset:offset+count2,0]+=pluck*(.65 if k%2 else 1)
            sound[offset:offset+count2,1]+=pluck*(1 if k%2 else .65)
    fade=np.minimum(np.arange(length)/RATE/1.3,1)*np.minimum((length-np.arange(length))/RATE/1.8,1)
    return sound*fade[:,None]

def pcm(ffmpeg, path, tempo=1):
    result=subprocess.run([ffmpeg,'-v','error','-i',str(path),'-af',f'atempo={tempo:.6f},loudnorm=I=-19:TP=-3:LRA=7','-ar',str(RATE),'-ac','1','-f','f32le','-'],capture_output=True,check=True)
    return np.frombuffer(result.stdout,dtype='<f4').copy()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--ffmpeg',default=shutil.which('ffmpeg'))
    parser.add_argument('--voice',default='Microsoft Zira Desktop')
    args=parser.parse_args()
    if not args.ffmpeg:raise SystemExit('Provide --ffmpeg')
    BUILD.mkdir(parents=True,exist_ok=True)
    metadata_path=ROOT/'assets/video/demo-videos.json'
    videos=json.loads(metadata_path.read_text(encoding='utf-8'))
    jobs=[]
    for key,texts in NARRATION.items():
        for i,text in enumerate(texts):jobs.append({'path':str(BUILD/f'{key}-{i}.wav'),'text':text})
    synthesize(jobs,args.voice)
    report=[]
    for info in videos:
        key='social' if 'social' in info['file'] else 'walkthrough'
        total=info['seconds']
        narration=np.zeros(round(total*RATE),dtype=np.float32)
        vtt=['WEBVTT','']
        for i,(chapter,text) in enumerate(zip(info['chapters'],NARRATION[key],strict=True)):
            path=BUILD/f'{key}-{i}.wav'
            with wave.open(str(path),'rb') as f: original=f.getnframes()/f.getframerate()
            available=chapter['duration']-.25
            speed=max(1,original/available)
            if speed>1.35:raise ValueError(f'Shorten {key} scene {i}: needs speed {speed:.2f}')
            samples=pcm(args.ffmpeg,path,speed)
            if len(samples)>round(available*RATE):samples=samples[:round(available*RATE)]
            # Very short edge fades avoid clicks without clipping speech.
            edge=min(240,len(samples)//2)
            samples[:edge]*=np.linspace(0,1,edge)
            samples[-edge:]*=np.linspace(1,0,edge)
            offset=round((chapter['start']+.12)*RATE)
            narration[offset:offset+len(samples)]+=samples
            vtt.extend([f"{stamp(chapter['start'])} --> {stamp(chapter['start']+chapter['duration'])}",text.replace('B M A','BMA').replace('C S V','CSV'),''])
            chapter['narration']=text
            report.append({'video':key,'scene':i,'seconds':round(len(samples)/RATE,2),'speed':round(speed,3)})
        # Original instrumental stays softer under speech, and rises gently in gaps.
        envelope=np.convolve(np.abs(narration)[::480],np.ones(15)/15,mode='same')
        target=np.where(envelope>.012,.65,1.0)
        target=np.convolve(np.pad(target,(5,5),mode='edge'),np.ones(11)/11,mode='valid')
        gain=np.interp(np.arange(len(narration))/480,np.arange(len(target)),target)
        background=music(total)*2.5*gain[:,None]
        mixed=narration[:,None]+background
        write_wav(BUILD/f'{key}-narration.wav',narration)
        write_wav(BUILD/f'{key}-background.wav',background)
        mixed_path=BUILD/f'{key}-mixed.wav'
        write_wav(mixed_path,mixed)
        original=ROOT/'assets/video'/info['file']
        output=BUILD/info['file']
        subprocess.run([args.ffmpeg,'-y','-v','error','-i',str(original),'-i',str(mixed_path),'-map','0:v:0','-map','1:a:0','-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-c:a','aac','-b:a','160k','-ar',str(RATE),'-t',str(total),'-movflags','+faststart',str(output)],check=True)
        shutil.copy2(output,original)
        original.with_suffix('.vtt').write_text('\n'.join(vtt),encoding='utf-8')
        info['audio']={'narration':'English synthetic narration','voice':args.voice,'music':'Original locally synthesized instrumental; no third-party recording','mix':'Narration-forward stereo AAC'}
    metadata_path.write_text(json.dumps(videos,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    (BUILD/'audio-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2),flush=True)

if __name__=='__main__':main()
