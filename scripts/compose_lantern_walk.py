"""Along the Lanterns / 沿灯而行 — original companion to Wishes Beneath the Eaves.

96 BPM, 4/4, D major, 32 bars / 80 seconds. A / A' / B / A'' form.
Nylon-like plucks, a short reed melody, warm bass, soft frame drum and paper shaker.
All instruments are synthesized here; no external recordings or melodies.
The original score and rain-wishes.m4a are deliberately independent of this file.

Render: python3 scripts/compose_lantern_walk.py [output.wav]
Encode: afconvert -f m4af -d aac -b 160000 output.wav public/audio/lantern-walk.m4a
Requires Python + NumPy. Circular placement and reflections carry tails over the loop.
"""

import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
DURATION = 32 * BAR
N = round(DURATION * SR)
rng = np.random.default_rng(20260909)
dry = np.zeros((N, 2), dtype=np.float64)
room = np.zeros_like(dry)


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def time(duration):
    return np.arange(round(duration * SR)) / SR


def envelope(t, attack, release):
    return (1 - np.exp(-t / attack)) * np.clip((len(t) / SR - t) / release, 0, 1)


def place(signal, beat, gain, pan=0, reverb=0.2):
    index = (np.arange(len(signal)) + round(beat * BEAT * SR)) % N
    gains = np.sqrt(np.array([1 - pan, 1 + pan]) / 2) * gain
    for channel in range(2):
        np.add.at(dry[:, channel], index, signal * gains[channel])
        np.add.at(room[:, channel], index, signal * gains[channel] * reverb)


def pluck(note, length=1.8, bright=1):
    t = time(length)
    f = hz(note)
    y = np.zeros_like(t)
    for k in range(1, 9):
        # A picked-string spectrum with fast-decaying upper partials. A second
        # quiet string adds width without the old score's long wash of sound.
        amplitude = np.sin(k * 0.71) / k ** (1.5 / bright)
        phase = 2 * np.pi * f * k * np.sqrt(1 + 0.000035 * k * k) * t
        y += amplitude * (np.sin(phase) + 0.10 * np.sin(phase * 1.0015)) * np.exp(-t * (2.1 + 0.7 * k))
    return y * envelope(t, 0.003, 0.07)


def reed(note, beats):
    t = time(beats * BEAT)
    f = hz(note)
    # Small vibrato, introduced after the attack, rather than a wavering pitch.
    phase = 2 * np.pi * f * t + (f * 0.0025 / 4.8) * np.sin(2 * np.pi * 4.8 * t) * np.minimum(t / 0.3, 1)
    tone = np.sin(phase) + 0.20 * np.sin(2 * phase) + 0.07 * np.sin(3 * phase)
    return tone * envelope(t, 0.025, 0.085) * 0.54


def bass(note, beats):
    t = time(beats * BEAT)
    phase = 2 * np.pi * hz(note) * t
    tone = np.sin(phase) + 0.34 * np.sin(2 * phase) + 0.13 * np.sin(3 * phase)
    return tone * np.exp(-t * 3.0) * envelope(t, 0.006, 0.05)


def drum():
    t = time(0.27)
    phase = 2 * np.pi * (72 * t + 3.2 * (1 - np.exp(-t * 32)))
    skin = np.sin(phase) * np.exp(-t * 17)
    skin += 0.12 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 34)
    return skin * envelope(t, 0.002, 0.02)


def rim():
    t = time(0.13)
    tone = (np.sin(2 * np.pi * 730 * t) + 0.35 * np.sin(2 * np.pi * 1170 * t)) * np.exp(-t * 65)
    noise = rng.normal(0, 0.18, len(t)) * np.exp(-t * 100)
    return (tone + noise) * envelope(t, 0.0015, 0.015)


def shaker():
    t = time(0.065)
    noise = rng.normal(0, 1, len(t))
    spectrum = np.fft.rfft(noise)
    freq = np.fft.rfftfreq(len(t), 1 / SR)
    spectrum *= (freq / (freq + 1400)) ** 2 / (1 + (freq / 6200) ** 4)
    noise = np.fft.irfft(spectrum, n=len(t))
    return noise * np.exp(-t * 65) * envelope(t, 0.002, 0.01)


# Bass, then close upper voicings. Major ninths and sixths keep the rainy setting
# while the clear four-beat pulse lends motion to walking and jumping.
chords = [
    [50, 57, 61, 64, 66],  # Dmaj9
    [43, 54, 59, 62, 64],  # Gmaj13
    [47, 54, 57, 62, 66],  # Bm7
    [45, 52, 59, 61, 64],  # Aadd9
    [40, 55, 59, 62, 66],  # Em9
    [43, 55, 59, 62, 66],  # Gmaj7
    [42, 57, 62, 64, 66],  # D/F#
    [45, 57, 59, 61, 64],  # Aadd9, resolving across the loop
]
# (beat, MIDI pitch, held beats). Short pickups, longer answers and explicit
# rests make a melody, rather than an uninterrupted metronomic arpeggio.
theme = [
    [(0, 74, .65), (.75, 78, .35), (1.5, 81, .8), (2.75, 78, .35), (3.25, 76, .55)],
    [(.25, 79, .6), (1, 78, .35), (1.75, 76, .55), (2.5, 74, .95)],
    [(0, 74, .4), (.75, 78, .4), (1.5, 81, .65), (2.5, 83, .35), (3.25, 81, .55)],
    [(.25, 78, .4), (1, 76, .65), (2, 73, .65), (3, 71, .65)],
    [(0, 71, .65), (1, 74, .4), (1.75, 78, .65), (2.75, 76, .7)],
    [(.25, 74, .55), (1, 71, .5), (2, 69, .45), (2.75, 71, .8)],
    [(0, 74, .65), (1, 76, .4), (1.75, 78, .65), (2.75, 81, .65)],
    [(0, 76, .65), (1, 73, .65), (2.25, 71, .45), (3, 73, .65)],
]
middle = [
    [(0, 78, .8), (1.25, 76, .45), (2, 74, 1.2)],
    [(.5, 71, .65), (1.5, 74, .5), (2.5, 76, .8)],
    [(0, 78, .6), (1, 81, .65), (2.25, 78, 1.1)],
    [(.5, 76, 1), (2, 73, .65), (3, 71, .5)],
    [(0, 71, .7), (1.25, 74, .5), (2, 76, 1.2)],
    [(.5, 74, .75), (1.75, 71, .6), (2.75, 69, .75)],
    [(0, 69, .6), (1, 74, .7), (2.25, 78, 1)],
    [(.5, 76, .65), (1.5, 73, .65), (2.75, 76, .75)],
]

for bar in range(32):
    section, phrase = divmod(bar, 8)
    chord = chords[phrase]
    start = bar * 4
    # Downbeat bass and a quiet offbeat pickup; a little variation every other
    # bar avoids four identical loops. No full drum kit or loud snare.
    for beat, note, level in [(0, chord[0], .086), (2, chord[0] + 12, .050)]:
        place(bass(note, 1.2), start + beat, level, -.03, .04)
    if bar % 2:
        place(bass(chords[(phrase + 1) % 8][0], .38), start + 3.5, .038, -.03, .04)
    for beat, strength in [(0, .060), (2, .044)]:
        place(drum(), start + beat, strength, .03, .025)
    for beat in [1, 3]:
        place(rim(), start + beat + .015, .023 if section != 2 else .015, -.21, .07)
    for step in range(8):
        if section == 2 and step % 2 == 0:
            continue
        place(shaker(), start + step / 2 + .02, .033 if step % 2 else .023, .31, 0)
    if phrase == 7:
        for beat in [3.25, 3.75]:
            place(rim(), start + beat, .014, -.13, .04)

    # Small chord gestures: two gentle strums, then an answering upper note.
    for beat in [.5, 2.5]:
        for j, note in enumerate(chord[1:4]):
            place(pluck(note + 12, 1.1, .86), start + beat + j * .023, .026, -.34 + j * .07, .24)
    for beat, index in [(1.5, 4), (3.5, 2)]:
        place(pluck(chord[index] + 12, 1.25), start + beat, .024, .38, .3)

    melody = list(middle[phrase] if section == 2 else theme[phrase])
    if section == 1 and phrase == 1:
        melody = [(.25, 79, .65), (1.25, 81, .45), (2, 79, .5), (3, 78, .6)]
    if section == 3 and phrase == 6:
        melody = [(0, 78, .65), (1, 81, .55), (2, 83, .45), (2.75, 81, .65)]
    for beat, note, length in melody:
        if section == 2:
            place(reed(note, length), start + beat + .018, .091, .10, .37)
            place(pluck(note - 12, 1.0, .8), start + beat, .034, -.17, .20)
        else:
            place(pluck(note, max(1.3, length * BEAT + .5)), start + beat + .012, .136, .12, .30)
            if section == 3 and phrase % 2 == 0:
                place(reed(note - 12, length), start + beat + .025, .020, -.06, .35)
    # Brief reed answers appear only at phrase endings, never as a long pad.
    if section == 1 and phrase in [1, 3, 5, 7]:
        place(reed(chord[3] + 12, .7), start + 3.1, .036, -.12, .35)

# Short room reflections keep the attack readable. The rhythm section remains
# mostly dry; there is no added continuous rain bed masking the transients.
mix = dry.copy()
for delay, gain in [(.061, .30), (.113, .26), (.197, .21), (.307, .17), (.439, .12), (.617, .085), (.853, .05)]:
    mix += np.roll(room, round(delay * SR), axis=0)[:, ::-1] * gain

# Gentle bandwidth shaping, DC removal and a consistent level. Target RMS is
# comparable to the original, so extra energy comes from rhythm, not loudness.
freq = np.fft.rfftfreq(N, 1 / SR)
shape = (freq / np.sqrt(freq * freq + 35**2)) / np.sqrt(1 + (freq / 7500)**6)
for channel in range(2):
    mix[:, channel] = np.fft.irfft(np.fft.rfft(mix[:, channel]) * shape, n=N)
mix = np.tanh(mix * 1.5)
mix *= min(.76 / np.max(np.abs(mix)), .15 / np.sqrt(np.mean(mix**2)))
fade = round(SR * .005)
for channel in range(2):
    mix[-fade:, channel] += (mix[0, channel] - mix[-1, channel]) * np.linspace(0, 1, fade)

out = Path(sys.argv[1] if len(sys.argv) > 1 else "work/lantern-walk.wav")
out.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(out), "wb") as file:
    file.setnchannels(2)
    file.setsampwidth(2)
    file.setframerate(SR)
    file.writeframes((np.clip(mix, -.98, .98) * 32767).astype("<i2").tobytes())
print(f"{out}: {DURATION:.2f}s; {BPM} BPM; stereo; peak={np.max(np.abs(mix)):.3f}; RMS={np.sqrt(np.mean(mix**2)):.3f}")
print(f"Loop boundary difference: {np.max(np.abs(mix[0] - mix[-1])):.8f}")
