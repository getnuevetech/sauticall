/** PCM16 mono rate conversion used by the 3CX programmable-extension examples. */

export function upsample8kTo24k(buf: Buffer) {
  const samples = Math.floor(buf.length / 2);
  const out = Buffer.alloc(samples * 6);
  for (let i = 0; i < samples; i++) {
    const sample = buf.readInt16LE(i * 2);
    out.writeInt16LE(sample, i * 6);
    out.writeInt16LE(sample, i * 6 + 2);
    out.writeInt16LE(sample, i * 6 + 4);
  }
  return out;
}

export function downsample24kTo8k(buf: Buffer) {
  const samples24k = Math.floor(buf.length / 2);
  const samples8k = Math.floor(samples24k / 3);
  const out = Buffer.alloc(samples8k * 2);
  for (let i = 0; i < samples8k; i++) {
    const srcByte = i * 6;
    if (srcByte + 1 < buf.length) out.writeInt16LE(buf.readInt16LE(srcByte), i * 2);
  }
  return out;
}
