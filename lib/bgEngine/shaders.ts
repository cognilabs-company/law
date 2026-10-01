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
precision mediump float;
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
uniform float ratio;
void main() {
  float c = texture(cur, uv).r;
  float p = texture(prev, uv).r;
  float t = c - 0.5;
  float x = t * t;
  float certainty = x * (5.68842 + x * (-0.748699 + x * (-57.8051 + x * (291.309 + x * -624.717))));
  float uncertainty = 1.0 - min(1.0, certainty);
  o = vec4(c + (p - c) * uncertainty * ratio, 0.0, 0.0, 1.0);
}`;

export const DOWN = `#version 300 es
precision mediump float;
in vec2 uv;
out vec4 o;
uniform sampler2D src;
uniform sampler2D mask;
uniform vec2 h;
uniform int first;
vec4 tap(vec2 q) {
  vec4 c = texture(src, q);
  if (first == 1) {
    float w = 1.0 - smoothstep(0.2, 0.6, texture(mask, q).r);
    return vec4(c.rgb * w, w);
  }
  return c;
}
void main() {
  o = (tap(uv) * 4.0 + tap(uv - h) + tap(uv + h) + tap(uv + vec2(h.x, -h.y)) + tap(uv - vec2(h.x, -h.y))) / 8.0;
}`;

export const UP = `#version 300 es
precision mediump float;
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
precision mediump float;
in vec2 uv;
out vec4 o;
uniform sampler2D cam;
uniform sampler2D guide;
uniform sampler2D mask;
uniform sampler2D blurA;
uniform sampler2D blurB;
uniform sampler2D imgA;
uniform sampler2D imgB;
uniform int kindA;
uniform int kindB;
uniform float t;
uniform vec2 texel;
uniform vec4 coverA;
uniform vec4 coverB;
uniform vec2 edge;
uniform float wrap;
float personMask(vec2 q, vec3 c) {
  float acc = 0.0;
  float total = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 s = q + vec2(float(x), float(y)) * texel;
      vec3 d = texture(guide, s).rgb - c;
      float w = exp(-dot(d, d) * 40.0) * ((x == 0 && y == 0) ? 2.0 : 1.0);
      acc += texture(mask, s).r * w;
      total += w;
    }
  }
  return smoothstep(edge.x, edge.y, acc / max(total, 1e-4));
}
vec3 layer(int kind, sampler2D blur, sampler2D img, vec4 cover, vec2 q, vec3 c, float m) {
  if (kind == 1) {
    vec4 b = texture(blur, q);
    vec3 bg = b.a > 0.004 ? b.rgb / b.a : c;
    return mix(bg, c, m);
  }
  if (kind == 2) {
    vec2 iq = cover.xy + q * cover.zw;
    vec3 bg = texture(img, iq).rgb;
    vec3 soft = textureLod(img, iq, 5.0).rgb;
    float band = clamp(1.0 - abs(m - 0.5) * 2.0, 0.0, 1.0);
    vec3 lit = 1.0 - (1.0 - c) * (1.0 - soft);
    vec3 person = mix(c, lit, band * wrap);
    return mix(bg, person, m);
  }
  return c;
}
void main() {
  vec2 q = uv;
  vec3 c = texture(cam, q).rgb;
  float m = (kindA == 0 && kindB == 0) ? 1.0 : personMask(q, c);
  vec3 a = layer(kindA, blurA, imgA, coverA, q, c, m);
  vec3 b = layer(kindB, blurB, imgB, coverB, q, c, m);
  o = vec4(mix(a, b, t), 1.0);
}`;
