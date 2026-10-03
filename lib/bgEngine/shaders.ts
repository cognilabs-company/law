export const VERTEX = `#version 300 es
layout(location = 0) in vec2 p;
out vec2 uv;
void main() {
  uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const COPY_MASK = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform highp sampler2D src;
void main() {
  ivec2 size = textureSize(src, 0);
  vec2 f = uv * vec2(size) - 0.5;
  ivec2 a = clamp(ivec2(floor(f)), ivec2(0), size - 1);
  ivec2 b = clamp(a + 1, ivec2(0), size - 1);
  vec2 w = fract(f);
  float top = mix(texelFetch(src, a, 0).r, texelFetch(src, ivec2(b.x, a.y), 0).r, w.x);
  float bottom = mix(texelFetch(src, ivec2(a.x, b.y), 0).r, texelFetch(src, b, 0).r, w.x);
  o = vec4(clamp(mix(top, bottom, w.y), 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

export const GUIDE = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D src;
uniform vec2 h;
void main() {
  o = (texture(src, uv + vec2(-h.x, -h.y)) + texture(src, uv + vec2(h.x, -h.y)) + texture(src, uv + vec2(-h.x, h.y)) + texture(src, uv + vec2(h.x, h.y))) * 0.25;
}`;

export const SMOOTH = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D cur;
uniform sampler2D prev;
uniform sampler2D gCur;
uniform sampler2D gPrev;
uniform float ratio;
uniform float base;
uniform vec2 motion;
void main() {
  float c = texture(cur, uv).r;
  float p = texture(prev, uv).r;
  float t = c - 0.5;
  float x = t * t;
  float certainty = x * (5.68842 + x * (-0.748699 + x * (-57.8051 + x * (291.309 + x * -624.717))));
  float uncertainty = 1.0 - min(1.0, certainty);
  float still = 1.0 - smoothstep(motion.x, motion.y, length(texture(gCur, uv).rgb - texture(gPrev, uv).rgb));
  o = vec4(c + (p - c) * still * mix(base, ratio, uncertainty), 0.0, 0.0, 1.0);
}`;

export const PREP = `#version 300 es
precision highp float;
in vec2 uv;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;
uniform sampler2D img;
uniform sampler2D mask;
void main() {
  vec3 i = texture(img, uv).rgb;
  float p = texture(mask, uv).r;
  o0 = vec4(i, p);
  o1 = vec4(i.r * i.r, i.r * i.g, i.r * i.b, i.g * i.g);
  o2 = vec4(i.g * i.b, i.b * i.b, i.r * p, i.g * p);
  o3 = vec4(i.b * p, 0.0, 0.0, 1.0);
}`;

export const BOX4 = `#version 300 es
precision highp float;
in vec2 uv;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;
uniform sampler2D s0;
uniform sampler2D s1;
uniform sampler2D s2;
uniform sampler2D s3;
uniform ivec2 dir;
uniform int r;
void main() {
  ivec2 size = textureSize(s0, 0);
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 a0 = vec4(0.0);
  vec4 a1 = vec4(0.0);
  vec4 a2 = vec4(0.0);
  vec4 a3 = vec4(0.0);
  for (int i = -8; i <= 8; i++) {
    if (i < -r || i > r) continue;
    ivec2 q = clamp(c + dir * i, ivec2(0), size - 1);
    a0 += texelFetch(s0, q, 0);
    a1 += texelFetch(s1, q, 0);
    a2 += texelFetch(s2, q, 0);
    a3 += texelFetch(s3, q, 0);
  }
  float n = float(2 * r + 1);
  o0 = a0 / n;
  o1 = a1 / n;
  o2 = a2 / n;
  o3 = a3 / n;
}`;

export const BOX1 = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D s0;
uniform ivec2 dir;
uniform int r;
void main() {
  ivec2 size = textureSize(s0, 0);
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 a = vec4(0.0);
  for (int i = -8; i <= 8; i++) {
    if (i < -r || i > r) continue;
    a += texelFetch(s0, clamp(c + dir * i, ivec2(0), size - 1), 0);
  }
  o = a / float(2 * r + 1);
}`;

export const AB = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D s0;
uniform sampler2D s1;
uniform sampler2D s2;
uniform sampler2D s3;
uniform float eps;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 t0 = texelFetch(s0, c, 0);
  vec4 t1 = texelFetch(s1, c, 0);
  vec4 t2 = texelFetch(s2, c, 0);
  vec4 t3 = texelFetch(s3, c, 0);
  vec3 m = t0.rgb;
  float mp = t0.a;
  float rr = t1.r - m.r * m.r + eps;
  float rg = t1.g - m.r * m.g;
  float rb = t1.b - m.r * m.b;
  float gg = t1.a - m.g * m.g + eps;
  float gb = t2.r - m.g * m.b;
  float bb = t2.g - m.b * m.b + eps;
  vec3 cov = vec3(t2.b, t2.a, t3.r) - m * mp;
  vec3 a = inverse(mat3(rr, rg, rb, rg, gg, gb, rb, gb, bb)) * cov;
  o = vec4(a, mp - dot(a, m));
}`;

export const NEAR = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D img;
uniform sampler2D ab;
void main() {
  vec3 i = texture(img, uv).rgb;
  vec4 k = texture(ab, uv);
  float w = 1.0 - smoothstep(0.1, 0.5, clamp(dot(k.rgb, i) + k.a, 0.0, 1.0));
  o = vec4(i * w, w);
}`;

export const DOWN = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D src;
uniform sampler2D ab;
uniform vec2 h;
uniform int first;
vec4 tap(vec2 q) {
  vec4 c = texture(src, q);
  if (first == 1) {
    vec4 k = texture(ab, q);
    float w = 1.0 - smoothstep(0.08, 0.45, clamp(dot(k.rgb, c.rgb) + k.a, 0.0, 1.0));
    return vec4(c.rgb * w, w);
  }
  return c;
}
void main() {
  o = (tap(uv) * 4.0 + tap(uv - h) + tap(uv + h) + tap(uv + vec2(h.x, -h.y)) + tap(uv - vec2(h.x, -h.y))) / 8.0;
}`;

export const UP = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D src;
uniform vec2 h;
void main() {
  vec4 s = texture(src, uv + vec2(-h.x * 2.0, 0.0)) + texture(src, uv + vec2(h.x * 2.0, 0.0)) + texture(src, uv + vec2(0.0, h.y * 2.0)) + texture(src, uv + vec2(0.0, -h.y * 2.0));
  s += (texture(src, uv + vec2(-h.x, h.y)) + texture(src, uv + vec2(h.x, h.y)) + texture(src, uv + vec2(h.x, -h.y)) + texture(src, uv + vec2(-h.x, -h.y))) * 2.0;
  o = s / 12.0;
}`;

export const COMPOSITE = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D cam;
uniform sampler2D ab;
uniform sampler2D near;
uniform sampler2D blurA;
uniform sampler2D blurB;
uniform sampler2D imgA;
uniform sampler2D imgB;
uniform int kindA;
uniform int kindB;
uniform float t;
uniform vec4 coverA;
uniform vec4 coverB;
uniform vec2 edge;
uniform float wrap;
vec3 layer(int kind, sampler2D blur, sampler2D img, vec4 cover, vec2 q, vec3 c, vec3 f, float m) {
  if (kind == 1) {
    vec4 b = texture(blur, q);
    vec3 bg = b.a > 0.004 ? b.rgb / b.a : c;
    return mix(bg, f, m);
  }
  if (kind == 2) {
    vec2 iq = cover.xy + q * cover.zw;
    vec3 bg = texture(img, iq).rgb;
    vec3 soft = textureLod(img, iq, 4.0).rgb;
    float band = clamp(1.0 - abs(m - 0.5) * 2.0, 0.0, 1.0);
    vec3 lit = 1.0 - (1.0 - f) * (1.0 - soft);
    return mix(bg, mix(f, lit, band * wrap), m);
  }
  return c;
}
void main() {
  vec2 q = uv;
  vec3 c = texture(cam, q).rgb;
  float m = 1.0;
  vec3 f = c;
  if (kindA != 0 || kindB != 0) {
    vec4 k = texture(ab, q);
    m = smoothstep(edge.x, edge.y, clamp(dot(k.rgb, c) + k.a, 0.0, 1.0));
    if (m > 0.01 && m < 0.99) {
      vec4 e = texture(near, q);
      vec3 bgc = e.a > 0.01 ? e.rgb / e.a : c;
      f = mix(c, clamp((c - (1.0 - m) * bgc) / max(m, 0.08), 0.0, 1.0), smoothstep(0.99, 0.6, m));
    }
  }
  o = vec4(mix(layer(kindA, blurA, imgA, coverA, q, c, f, m), layer(kindB, blurB, imgB, coverB, q, c, f, m), t), 1.0);
}`;
