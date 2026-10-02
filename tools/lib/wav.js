/**
 * tools/lib/wav.js — 极简 RIFF/WAVE 读写
 *
 * 只做这个工程真正需要的：PCM 16-bit 立体声（以及能读 24/32/float32）。
 * 不引依赖 —— 40MB 的音频读一次就够了，没必要为此装一个包。
 */

import { readFileSync, writeFileSync } from "node:fs";

/** 读 WAV → 单声道 Float32（多声道求平均）+ 元信息 */
export function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${path} 不是 RIFF/WAVE 文件`);
  }
  let pos = 12;
  let fmt = null;
  let dataOff = -1;
  let dataLen = 0;

  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      dataOff = body;
      dataLen = Math.min(size, buf.length - body);
    }
    pos = body + size + (size % 2);
  }

  if (!fmt || dataOff < 0) throw new Error("WAV 缺少 fmt 或 data 块");

  const { channels, sampleRate, bitsPerSample, audioFormat } = fmt;
  const bytes = bitsPerSample / 8;
  const frames = Math.floor(dataLen / (bytes * channels));
  const out = new Float32Array(frames);

  for (let i = 0; i < frames; i++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) {
      const o = dataOff + (i * channels + c) * bytes;
      let v;
      if (audioFormat === 3) v = buf.readFloatLE(o);
      else if (bitsPerSample === 16) v = buf.readInt16LE(o) / 32768;
      else if (bitsPerSample === 24) {
        const b0 = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);
        v = (b0 & 0x800000 ? b0 | 0xff000000 : b0) / 8388608;
      } else if (bitsPerSample === 32) v = buf.readInt32LE(o) / 2147483648;
      else throw new Error(`不支持的位深 ${bitsPerSample}`);
      acc += v;
    }
    out[i] = acc / channels;
  }

  return {
    samples: out,
    sampleRate,
    channels,
    frames,
    durationMs: (frames / sampleRate) * 1000,
  };
}

/** 写 16-bit PCM 立体声 WAV。左右声道同内容（试听够用）。 */
export function writeWavStereo16(path, mono, sampleRate) {
  const n = mono.length;
  const dataBytes = n * 2 * 2;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // stereo
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28); // byteRate
  buf.writeUInt16LE(4, 32); // blockAlign
  buf.writeUInt16LE(16, 34); // bits
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);

  let o = 44;
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, mono[i]));
    const s = Math.round(v * 32767);
    buf.writeInt16LE(s, o);
    buf.writeInt16LE(s, o + 2);
    o += 4;
  }
  writeFileSync(path, buf);
  return buf.length;
}
