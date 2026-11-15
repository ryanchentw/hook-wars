/** A triangle that covers the screen; `vUv` runs 0..1 across it. */
export const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const TAPS = /* glsl */ `
vec3 corners(sampler2D map, vec2 uv, vec2 step) {
  return texture2D(map, uv + step * vec2(-1.0, -1.0)).rgb + texture2D(map, uv + step * vec2(1.0, -1.0)).rgb +
    texture2D(map, uv + step * vec2(-1.0, 1.0)).rgb + texture2D(map, uv + step * vec2(1.0, 1.0)).rgb;
}`;

/**
 * Halves the light sources and keeps what is brighter than the threshold. Brightness is the strongest channel, so a
 * saturated neon tube counts for as much as a white lamp; the knee lets the glow come in gradually instead of at a line.
 */
export const BRIGHT = /* glsl */ `
uniform sampler2D source;
uniform vec2 texel;
uniform float threshold;
uniform float knee;
varying vec2 vUv;
${TAPS}
void main() {
  vec3 c = 0.25 * corners(source, vUv, texel);
  float brightness = max(c.r, max(c.g, c.b));
  float soft = clamp(brightness - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  gl_FragColor = vec4(c * max(soft, brightness - threshold) / max(brightness, 1e-4), 1.0);
}`;

/** Halves again: the middle and four diagonal neighbours, each a bilinear tap, which is a blur as well as a shrink. */
export const SHRINK = /* glsl */ `
uniform sampler2D source;
uniform vec2 texel;
varying vec2 vUv;
${TAPS}
void main() {
  gl_FragColor = vec4((texture2D(source, vUv).rgb * 4.0 + corners(source, vUv, texel)) / 8.0, 1.0);
}`;

/**
 * Doubles the blurrier level below with a tent of eight taps and adds \`spread\` of it to the sharper level. Adding, not
 * averaging: a barb a few pixels across keeps its bright core and gains a halo, where an average would thin it to nothing.
 */
export const GROW = /* glsl */ `
uniform sampler2D source;
uniform sampler2D sharper;
uniform vec2 texel;
uniform float spread;
varying vec2 vUv;
${TAPS}
void main() {
  vec3 c = texture2D(source, vUv + texel * vec2(-2.0, 0.0)).rgb + texture2D(source, vUv + texel * vec2(2.0, 0.0)).rgb;
  c += texture2D(source, vUv + texel * vec2(0.0, -2.0)).rgb + texture2D(source, vUv + texel * vec2(0.0, 2.0)).rgb;
  c += 2.0 * corners(source, vUv, texel);
  gl_FragColor = vec4(texture2D(sharper, vUv).rgb + c / 12.0 * spread, 1.0);
}`;

/** Added over the finished picture. */
export const ADD = /* glsl */ `
uniform sampler2D source;
uniform float strength;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(source, vUv).rgb * strength, 1.0);
}`;
