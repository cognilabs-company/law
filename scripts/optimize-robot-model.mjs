// Writes the production copy of the LexGo robot (public/models/lexgo-robot.web.glb)
// from the full model: textures 2048² → 1024² JPEG (the canvas is ~400 px
// wide) and only the clips production plays (LexGoRobot IDLE_BEATS). The dev
// harness keeps loading the full model with every clip (robot-config
// MODEL_URL). Re-run after replacing the model:
//   node scripts/optimize-robot-model.mjs public/models/lexgo-robot.glb public/models/lexgo-robot.web.glb wave_goodbye_01.001
import fs from "node:fs";
import sharp from "sharp";

const [, , src, dst, ...KEEP] = process.argv;
const b = fs.readFileSync(src);
const jl = b.readUInt32LE(12); const j = JSON.parse(b.slice(20, 20 + jl));
const binStart = 20 + jl + 8;
const view = (v) => b.slice(binStart + (v.byteOffset || 0), binStart + (v.byteOffset || 0) + v.byteLength);
  j.animations = j.animations.filter((a) => KEEP.includes(a.name));
  // accessors still referenced
  const usedAcc = new Set();
  for (const m of j.meshes) for (const p of m.primitives) { Object.values(p.attributes).forEach((a) => usedAcc.add(a)); if (p.indices !== undefined) usedAcc.add(p.indices); (p.targets || []).forEach((t) => Object.values(t).forEach((a) => usedAcc.add(a))); }
  for (const s of j.skins || []) if (s.inverseBindMatrices !== undefined) usedAcc.add(s.inverseBindMatrices);
  for (const a of j.animations) for (const s of a.samplers) { usedAcc.add(s.input); usedAcc.add(s.output); }
  const accMap = new Map(); const accs = [];
  j.accessors.forEach((a, i) => { if (usedAcc.has(i)) { accMap.set(i, accs.length); accs.push(a); } });
  const ra = (i) => accMap.get(i);
  for (const m of j.meshes) for (const p of m.primitives) { for (const k in p.attributes) p.attributes[k] = ra(p.attributes[k]); if (p.indices !== undefined) p.indices = ra(p.indices); (p.targets || []).forEach((t) => { for (const k in t) t[k] = ra(t[k]); }); }
  for (const s of j.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = ra(s.inverseBindMatrices);
  for (const a of j.animations) for (const s of a.samplers) { s.input = ra(s.input); s.output = ra(s.output); }
  j.accessors = accs;
  // buffer views still referenced
  const usedBv = new Set([...accs.map((a) => a.bufferView).filter((x) => x !== undefined), ...j.images.map((im) => im.bufferView)]);
  const bvMap = new Map(); const bvs = []; const data = [];
  const normal = j.materials[0].normalTexture?.index;
  const imgQ = new Map(j.images.map((im, i) => [im.bufferView, j.textures.findIndex((t) => t.source === i) === normal ? 92 : 85]));
  for (const [i, v] of j.bufferViews.entries()) {
    if (!usedBv.has(i)) continue;
    let d = view(v);
    if (imgQ.has(i)) d = await sharp(d).resize(1024, 1024).jpeg({ quality: imgQ.get(i), mozjpeg: true }).toBuffer();
    bvMap.set(i, bvs.length); bvs.push(v); data.push(d);
  }
  accs.forEach((a) => { if (a.bufferView !== undefined) a.bufferView = bvMap.get(a.bufferView); });
  j.images.forEach((im) => { im.bufferView = bvMap.get(im.bufferView); im.mimeType = "image/jpeg"; });
  const parts = []; let off = 0;
  bvs.forEach((v, i) => { const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; } v.byteOffset = off; v.byteLength = data[i].length; parts.push(data[i]); off += data[i].length; });
  const pad = (4 - (off % 4)) % 4; if (pad) parts.push(Buffer.alloc(pad));
  j.bufferViews = bvs; j.buffers[0].byteLength = off;
  const bin = Buffer.concat(parts);
  let json = Buffer.from(JSON.stringify(j)); json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(28 + json.length + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(dst, Buffer.concat([h, jh, json, bh, bin]));
  console.log("clips", j.animations.map((a) => a.name), "bytes", 28 + json.length + bin.length);
