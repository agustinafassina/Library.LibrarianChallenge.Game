import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "audio");
mkdirSync(outDir, { recursive: true });

const RATE = 22050;

function env(t, dur, attack = 0.008) {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  const remain = Math.max(0.0001, dur - attack);
  return Math.exp((-5 * (t - attack)) / remain);
}

function sampleAt(t, freqs, dur, noise = 0) {
  let v = 0;
  for (const { f, amp = 1 } of freqs) {
    v += Math.sin(2 * Math.PI * f * t) * amp;
  }
  if (noise) v += (Math.random() * 2 - 1) * noise;
  return v * env(t, dur);
}

function render(seconds, fn) {
  const n = Math.floor(RATE * seconds);
  const samples = new Float32Array(n);
  let peak = 0.0001;
  for (let i = 0; i < n; i++) {
    const s = fn(i / RATE, i);
    samples[i] = s;
    peak = Math.max(peak, Math.abs(s));
  }
  const scale = 0.86 / peak;
  return Int16Array.from(samples, (s) => {
    const x = Math.max(-1, Math.min(1, s * scale));
    return x < 0 ? Math.round(x * 32768) : Math.round(x * 32767);
  });
}

function writeWav(name, pcm) {
  const dataSize = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 38);
  buf.writeUInt32LE(dataSize, 42);
  Buffer.from(pcm.buffer, pcm.byteOffset, dataSize).copy(buf, 44);
  const path = join(outDir, name);
  writeFileSync(path, buf);
  console.log("wrote", path, buf.length, "bytes");
}

const ui = render(0.07, (t) => sampleAt(t, [{ f: 980, amp: 0.7 }, { f: 1960, amp: 0.35 }], 0.07, 0.04));
writeWav("ui.wav", ui);

const drop = render(0.22, (t) => {
  const thud = sampleAt(t, [{ f: 92, amp: 1 }, { f: 48, amp: 0.7 }, { f: 180, amp: 0.25 }], 0.22, 0.12 * Math.exp(-t * 18));
  const tick = t < 0.03 ? sampleAt(t, [{ f: 420, amp: 0.35 }], 0.03, 0.05) : 0;
  return thud + tick;
});
writeWav("drop.wav", drop);

const notes = [
  { f: 523.25, at: 0.0 },
  { f: 659.25, at: 0.11 },
  { f: 783.99, at: 0.22 },
  { f: 1046.5, at: 0.34 },
];
const win = render(0.72, (t) => {
  let v = 0;
  for (const note of notes) {
    const local = t - note.at;
    if (local < 0 || local > 0.42) continue;
    v += sampleAt(local, [{ f: note.f, amp: 0.9 }, { f: note.f * 2, amp: 0.18 }], 0.42);
  }
  return v;
});
writeWav("win.wav", win);

function renderLoop(seconds, fn, peakTarget = 0.22) {
  const n = Math.floor(RATE * seconds);
  const samples = new Float32Array(n);
  let peak = 0.0001;
  for (let i = 0; i < n; i++) {
    const s = fn(i / RATE);
    samples[i] = s;
    peak = Math.max(peak, Math.abs(s));
  }
  const scale = peakTarget / peak;
  return Int16Array.from(samples, (s) => {
    const x = Math.max(-1, Math.min(1, s * scale));
    return x < 0 ? Math.round(x * 32768) : Math.round(x * 32767);
  });
}

let brown = 0;
const ambience = renderLoop(8, (t) => {
  const lfo = 0.72 + 0.28 * Math.sin((2 * Math.PI * t) / 8);
  const pad =
    Math.sin(2 * Math.PI * 110 * t) * 0.22 +
    Math.sin(2 * Math.PI * 165 * t) * 0.14 +
    Math.sin(2 * Math.PI * 220 * t) * 0.09;
  brown = brown * 0.97 + (Math.random() * 2 - 1) * 0.03;
  const dust = Math.sin(2 * Math.PI * 880 * t) * 0.012 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 4));
  return pad * lfo + brown * 0.55 + dust;
}, 0.2);
writeWav("ambience.wav", ambience);
