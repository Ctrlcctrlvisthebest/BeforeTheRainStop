"""Render the original 80-second Paper Wishes score; requires Python + NumPy.
No samples or third-party melodies are used. The mix is circular, including reverb.
Run: python3 scripts/compose_music.py [output.wav]
Encode on macOS: afconvert -f m4af -d aac -b 160000 input.wav public/audio/rain-wishes.m4a
"""
import sys, wave
from pathlib import Path
import numpy as np

SR = 44100
BPM = 72
BEAT = 60 / BPM
BAR = BEAT * 3
DURATION = 32 * BAR
N = round(DURATION * SR)
rng = np.random.default_rng(20260905)
dry = np.zeros((N, 2), dtype=np.float64)


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def place(signal, at, gain, pan=0):
    index = (np.arange(len(signal)) + round(at * SR)) % N
    gains = np.array([np.sqrt((1-pan)/2), np.sqrt((1+pan)/2)]) * gain
    for ch in range(2):
        np.add.at(dry[:, ch], index, signal * gains[ch])


def pluck(note, duration=3.2, soft=False):
    t = np.arange(round(duration * SR)) / SR
    f = hz(note)
    y = np.zeros(len(t))
    # Decaying, gently inharmonic string partials; no harsh saw-wave oscillators.
    for k in range(1, 10):
        amp = (1 / k ** (1.55 if soft else 1.3)) * np.sin(k * .79)
        decay = np.exp(-t * (1.2 + .38 * k))
        y += amp * np.sin(2*np.pi*f*k*np.sqrt(1 + .000055*k*k)*t) * decay
    y *= (1 - np.exp(-t/0.004)) * np.minimum(1, (duration-t)/.1)
    return y


def felt(note, duration=5.0):
    t = np.arange(round(duration*SR))/SR
    y = sum((.69**(k-1)/k) * np.sin(2*np.pi*hz(note)*k*t + .07*np.sin(2*np.pi*.55*t)) * np.exp(-t*(.45+k*.2)) for k in range(1,7))
    return y * (1-np.exp(-t/.013)) * np.minimum(1,(duration-t)/.2)


def flute(note, duration):
    t = np.arange(round(duration*SR))/SR
    vibrato = .00065 * np.sin(2*np.pi*4.9*t) * np.minimum(t/.7,1)
    phase = 2*np.pi*hz(note)*(t+vibrato)
    tone = np.sin(phase) + .12*np.sin(phase*2) + .055*np.sin(phase*3)
    breath = rng.normal(0,1,len(t))
    breath = np.convolve(breath, np.ones(13)/13, mode='same')
    env = np.minimum(t/.2,1)*np.minimum((duration-t)/.35,1)
    return (tone*.5+breath*.028) * np.maximum(env,0)


def bell(note):
    t = np.arange(round(5.8*SR))/SR
    y = sum(a*np.sin(2*np.pi*hz(note)*ratio*t)*np.exp(-t/decay) for ratio,a,decay in [(1,.7,1.9),(2.004,.18,1.1),(2.76,.06,.55),(4.02,.035,.3)])
    return y*(1-np.exp(-t/.003))*np.minimum(1,(5.8-t)/.1)

# Eight-bar harmony, with deliberate silence between lead phrases.
chords = [[50,57,60,65],[46,53,57,60],[53,60,64,69],[48,55,62,67],
          [50,57,62,65],[43,50,57,62],[46,53,60,65],[45,52,55,62]]
phrases = [
 [(0,69,1), (1.5,72,.5), (2,74,1)],
 [(.5,77,1),(2,74,.7)],
 [(0,72,1.5),(2,69,1)],
 [(.5,67,1),(2,65,1)],
 [(0,69,.75),(1,67,.75),(2,65,.8)],
 [(.5,62,1.6)],
 [(0,65,1),(1.5,67,.5),(2,69,.7)],
 [(0,64,1.2),(1.5,62,1.1)],
]
for bar in range(32):
    section = bar//8
    chord = chords[bar%8]
    start = bar*BAR
    # Felt keys provide harmonic direction; alternating bass keeps a lilting 3/4 pulse.
    for j,note in enumerate(chord):
        place(felt(note),start+.022*j,.055 if j else .09, -.15+j*.1)
    if bar%2==0:
        place(felt(chord[0]-12),start,.055,-.05)
    pattern = [(0,chord[0]+12),(.75,chord[1]+12),(1.5,chord[2]+12),(2.25,chord[1]+12)]
    for j,(beat,note) in enumerate(pattern):
        if section==2 and j==2: continue
        place(pluck(note,soft=True),start+beat*BEAT+.012,.046+(.009 if section==1 else 0),-.38)
    phrase = phrases[bar%8]
    for j,(beat,note,length) in enumerate(phrase):
        # A / A' / quieter B / return: melodic variation, not a repeating alert sound.
        if section==2 and bar%8 in [0,3,6]: continue
        if section==1 and bar%8==2: note=74 if j==0 else 72
        if section==3 and bar%8==6: note=[69,72,69][j]
        place(pluck(note),start+beat*BEAT+.035,.135 if section!=2 else .085,.23)
    if section in [1,2] and bar%2==0:
        note = [74,72,69,65][(bar%8)//2]
        place(flute(note,BEAT*2.35),start+.22,.044,.12)
    if bar in [0,8,16,24,30]:
        place(bell(86 if bar%16==0 else 81),start+.1,.035,.55)

# Very soft sustained strings, with overlapping envelopes at the loop boundary.
for bar in range(32):
    duration = BAR*1.5
    t=np.arange(round(duration*SR))/SR
    env=np.sin(np.pi*np.minimum(t/duration,1))**2
    chord=chords[bar%8]
    for note in chord[1:]:
        phase=2*np.pi*hz(note)*t
        y=(np.sin(phase)+.3*np.sin(phase*2)+.15*np.sin(phase*.998))*.018*env
        place(y,bar*BAR-.5,1,.05)

# Low-level rain texture. Smooth filtering prevents headphone hiss from masking notes.
for ch in range(2):
    noise=rng.normal(0,1,N)
    spectrum=np.fft.rfft(noise)
    freq=np.fft.rfftfreq(N,1/SR)
    spectrum*= (freq/(freq+180)) / (1+(freq/1700)**2)
    rain=np.fft.irfft(spectrum,n=N)
    rain=rain/np.std(rain)*.0023
    dry[:,ch]+=rain

# Circular stereo reflections preserve the reverb tail when the music loops.
mix=dry.copy()
for delay,gain in [(.127,.09),(.233,.12),(.389,.105),(.557,.085),(.809,.06),(1.137,.045),(1.573,.03),(2.123,.018)]:
    mix+=np.roll(dry,round(delay*SR),axis=0)[:,::-1]*gain
mix-=mix.mean(axis=0)
mix=np.tanh(mix*1.55)
mix*=.78/np.max(np.abs(mix))
# Tiny boundary correction avoids an instantaneous sample jump without a musical fade-out.
fade=round(SR*.008)
for ch in range(2):
    correction=(mix[0,ch]-mix[-1,ch])*np.linspace(0,1,fade)
    mix[-fade:,ch]+=correction
out=Path(sys.argv[1] if len(sys.argv)>1 else 'work/rain-wishes.wav')
out.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(out),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR)
    w.writeframes((np.clip(mix,-.98,.98)*32767).astype('<i2').tobytes())
print(f'{out}: {DURATION:.2f}s, stereo, peak {np.max(np.abs(mix)):.3f}, RMS {np.sqrt(np.mean(mix**2)):.3f}')
print('Loop boundary difference:',np.abs(mix[0]-mix[-1]).max())
