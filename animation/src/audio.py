import numpy as np, json, subprocess
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, resample_poly

SR = 48000
DUR = 60.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

# line id -> start time (seconds)
TIMES = {"01": 3.6, "02": 8.0, "03": 12.2, "04": 19.0, "05": 23.4, "06": 27.8, "07": 30.6,
         "08": 33.6, "09": 36.6, "10": 39.8, "11": 48.8, "12": 51.0, "13": 54.0}
WHO = {}
TEXT = {}
for ln in open("lines.tsv", encoding="utf-8"):
    i, w, e, t = ln.rstrip("\n").split("\t")
    WHO[i] = w
    TEXT[i] = t


def load(path):
    sr, x = wavfile.read(path)
    x = x.astype(np.float64) / 32768.0
    x = resample_poly(x, SR, sr)
    # trim silence
    a = np.abs(x)
    idx = np.where(a > 0.01)[0]
    x = x[max(0, idx[0] - 200): idx[-1] + 2400]
    return x


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def robot(x):
    t = np.arange(len(x)) / SR
    ring = x * np.sin(2 * np.pi * 85 * t)
    y = 0.8 * x + 0.22 * ring
    # short metallic comb
    d = int(0.0045 * SR)
    out = y.copy()
    for k in range(d, len(out)):
        out[k] += 0.45 * out[k - d]
    out = hp(out, 160)
    return out / np.max(np.abs(out)) * 0.9


def place(buf, x, t, gain=1.0):
    s = int(t * SR)
    e = min(len(buf), s + len(x))
    buf[s:e] += x[: e - s] * gain


voice = np.zeros(N)
meta = []
env_fps = 30
for i, t0 in TIMES.items():
    x = load(f"voice/raw_{i}.wav")
    if WHO[i] == "R":
        x = robot(x)
    else:
        x = hp(x, 120)
        x = x / np.max(np.abs(x)) * 0.9
    place(voice, x, t0, 0.85)
    # envelope for lip sync at 30fps
    hop = SR // env_fps
    env = [float(np.sqrt(np.mean(x[k:k + hop] ** 2))) for k in range(0, len(x), hop)]
    m = max(env)
    env = [round(v / m, 3) for v in env]
    meta.append({"id": i, "who": WHO[i], "text": TEXT[i], "start": t0, "end": round(t0 + len(x) / SR, 3), "env": env})
    print(i, WHO[i], t0, round(t0 + len(x) / SR, 2))

json.dump(meta, open("dialogue.json", "w", encoding="utf-8"), ensure_ascii=False)

# small room/outdoor reverb on voices
def reverb(x, wet=0.12):
    ir_len = int(1.2 * SR)
    ir = rng.standard_normal(ir_len) * np.exp(-np.arange(ir_len) / (0.25 * SR))
    ir = lp(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    from scipy.signal import fftconvolve
    w = fftconvolve(x, ir)[: len(x)]
    return x + wet * w


voice = reverb(voice, 0.18)

# ---------------- music ----------------
tt = np.arange(N) / SR


def midi(n):
    return 440 * 2 ** ((n - 69) / 12)


def musicbox(f, dur=2.5, amp=0.18):
    n = int(dur * SR)
    t = np.arange(n) / SR
    e = np.exp(-t * 2.2) * np.minimum(1, t * 400)
    s = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 4)
         + 0.12 * np.sin(2 * np.pi * f * 5.04 * t) * np.exp(-t * 9))
    return s * e * amp


def pad(freqs, t0, t1, amp=0.05, att=1.5, rel=2.0):
    n = int((t1 - t0 + rel) * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.13):
            ff = f * 2 ** (det / 12)
            ph = rng.random() * 6.28
            # soft saw-ish via few harmonics
            for h in range(1, 6):
                s += np.sin(2 * np.pi * ff * h * t + ph * h) / (h ** 1.6)
    env = np.minimum(1, t / att)
    rel_start = t1 - t0
    env *= np.where(t > rel_start, np.exp(-(t - rel_start) / (rel / 3)), 1)
    s = lp(s * env, 1400)
    return s * amp / len(freqs)


music = np.zeros(N + SR * 4)

# chords (root-position triads, MIDI)
C = [48, 55, 60, 64]; F = [41, 53, 57, 60]; G = [43, 55, 59, 62]; Am = [45, 52, 57, 60]
Em = [40, 52, 55, 59]; Dm = [38, 50, 53, 57]; Fmaj7 = [41, 53, 57, 64]; Csus = [48, 55, 60, 65]
prog = [
    (0.0, 4.0, F), (4.0, 8.0, C), (8.0, 12.0, Am), (12.0, 16.5, G),
    (16.5, 21.0, Fmaj7), (21.0, 25.0, Em), (25.0, 27.4, Am), (27.4, 31.0, F),
    (31.0, 34.0, C), (34.0, 37.4, G),
    # silence-ish at shutdown: drone only
    (39.0, 44.0, [45, 57]),
    (44.0, 47.4, F), (47.4, 51.0, G), (51.0, 54.0, Am), (54.0, 57.0, F), (57.0, 61.0, C),
]
for a, b, ch in prog:
    seg = pad([midi(n) for n in ch], a, b, amp=0.10 if a < 44 else 0.13)
    place(music, seg, a)

# music box melody (time, midi)
mel = [
    (0.5, 72), (1.0, 76), (1.5, 79), (2.5, 77), (3.0, 76), (4.5, 72), (5.0, 74), (5.5, 76), (6.5, 79),
    (8.5, 76), (9.0, 72), (9.5, 69), (10.5, 71), (12.5, 74), (13.0, 71), (13.5, 67), (14.5, 74),
    (17.0, 76), (17.75, 77), (18.5, 81), (20.0, 79), (21.5, 76), (22.25, 79), (23.0, 83), (24.5, 81),
    (25.5, 76), (26.5, 72),
    # meteor sparkle phrase
    (27.6, 84), (27.85, 88), (28.1, 91), (28.35, 89), (29.2, 84), (31.2, 81), (31.7, 84), (32.2, 88),
    (34.2, 86), (34.7, 83), (35.2, 79), (36.4, 81),
    # dawn
    (44.5, 72), (45.0, 74), (45.5, 76), (46.5, 77), (47.6, 79), (48.1, 83), (48.6, 86),
    (51.2, 81), (51.7, 76), (52.2, 72), (53.0, 79), (54.2, 77), (54.7, 81), (55.2, 84),
    (56.5, 83), (57.2, 84), (57.6, 79), (58.0, 76), (58.4, 72),
]
for t0, n in mel:
    place(music, musicbox(midi(n), amp=0.11), t0)
    place(music, musicbox(midi(n), amp=0.03), t0 + 0.375)  # echo

music = music[:N]
# fade out end
music[-int(1.2 * SR):] *= np.linspace(1, 0, int(1.2 * SR)) ** 1.5

# ---------------- sfx ----------------
sfx = np.zeros(N + SR * 3)
# wind: shaped noise across whole piece, stronger at dusk
wind = lp(rng.standard_normal(N), 600) * 0.6
wind_env = 0.05 + 0.05 * np.sin(tt * 0.7) ** 2
wind_env *= np.interp(tt, [0, 16, 20, 42, 47, 60], [1.0, 1.0, 0.55, 0.5, 0.8, 0.6])
sfx[:N] += wind * wind_env

# crickets at night (19 - 46)
cr = np.zeros(N)
t = 19.5
while t < 46:
    for k in range(3):
        n = int(0.03 * SR)
        tc = np.arange(n) / SR
        chirp = np.sin(2 * np.pi * (4300 + rng.random() * 300) * tc) * np.sin(np.pi * tc / 0.03)
        place(cr, chirp, t + k * 0.05, 0.012)
    t += 0.55 + rng.random() * 0.5
cr *= np.interp(tt, [19, 21, 37, 38.5, 43, 46], [0, 1, 1, 0.4, 0.4, 0])
sfx[:N] += cr

# wagon rolling rumble during walk 0-16.5
roll = lp(rng.standard_normal(N), 180) * 0.25
roll *= (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 1.1 * tt)))
roll *= np.interp(tt, [0, 1, 16, 17], [0, 1, 1, 0])
sfx[:N] += roll * 0.5


def tone(f0, f1, dur, amp, shape="sin"):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = np.linspace(f0, f1, n)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) if shape == "sin" else np.sign(np.sin(ph)) * 0.5
    env = np.minimum(1, t / 0.005) * np.minimum(1, (dur - t) / 0.02)
    return s * env * amp


# low battery beeps before L02
for k in range(2):
    place(sfx, lp(tone(1800, 1800, 0.09, 0.08, "sq"), 4000), 7.3 + k * 0.18)
# battery beep again near L09
for k in range(3):
    place(sfx, lp(tone(1500, 1500, 0.08, 0.06, "sq"), 4000), 35.9 + k * 0.2)

# meteor whooshes + shimmer
for tm in [27.2, 28.9, 30.1, 32.4, 33.3, 35.0]:
    n = int(1.4 * SR)
    w = bp(rng.standard_normal(n), 2500, 7000) * np.exp(-np.arange(n) / (0.35 * SR)) * np.minimum(1, np.arange(n) / (0.15 * SR))
    place(sfx, w, tm, 0.05)
    place(sfx, tone(2600, 3400, 0.8, 0.02) * np.exp(-np.arange(int(0.8 * SR)) / (0.2 * SR)), tm + 0.1)

# power down sweep
pd = tone(900, 60, 1.6, 0.13) * np.linspace(1, 0, int(1.6 * SR)) ** 0.7
place(sfx, lp(pd, 3000), 37.85)
place(sfx, lp(tone(1200, 1200, 0.06, 0.05, "sq"), 3000), 37.75)

# boot chime at 47.6 : rising arpeggio
for k, n in enumerate([72, 76, 79, 84]):
    place(sfx, musicbox(midi(n), 1.5, 0.09), 47.6 + k * 0.11)
place(sfx, lp(tone(80, 600, 0.5, 0.05), 2000) * np.linspace(0, 1, int(0.5 * SR)), 47.1)

# birds at dawn
t = 49.5
while t < 59.5:
    n_notes = rng.integers(2, 5)
    for k in range(n_notes):
        f0 = 2800 + rng.random() * 1500
        place(sfx, tone(f0, f0 * (1.25 + rng.random() * 0.3), 0.07, 0.018), t + k * 0.1)
    t += 0.9 + rng.random() * 1.4

sfx = sfx[:N]

# ---------------- mix ----------------
# duck music under voices
duck = np.ones(N)
for m in meta:
    s, e = int((m["start"] - 0.15) * SR), int((m["end"] + 0.2) * SR)
    duck[s:e] = 0.55
duck = lp(duck, 4)
mix = voice * 1.0 + music * 0.9 * duck + sfx * 0.9
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
peak = np.max(np.abs(mix))
mix = mix / peak * 0.93
st = np.stack([mix, mix], 1)
wavfile.write("mix.wav", SR, (st * 32767).astype(np.int16))
wavfile.write("voice_only.wav", SR, (voice / np.max(np.abs(voice)) * 32767 * 0.9).astype(np.int16))
print("peak", peak)
