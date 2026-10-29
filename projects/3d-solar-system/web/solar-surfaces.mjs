/** Deterministic, offline albedo and relief. Lighting belongs to the renderer. */
const TAU = Math.PI * 2;
const KEYS = new Set(['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'moon', 'sun']);
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const smooth = (value) => value * value * (3 - 2 * value);
const mix = (a, b, t) => a + (b - a) * t;

function hash(x, y, z) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Sampling a 3D field on the sphere makes longitude periodic without a seam.
function noise(x, y, z, frequency, seed = 0) {
  x = x * frequency + seed * 13.7;
  y = y * frequency + seed * 7.3;
  z = z * frequency - seed * 9.1;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const a = mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx);
  const b = mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx);
  const c = mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx);
  const d = mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx);
  return mix(mix(a, b, fy), mix(c, d, fy), fz) * 2 - 1;
}

function makeCraters(seed, count) {
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({length: count}, () => {
    const y = random() * 2 - 1;
    const angle = random() * TAU;
    const radial = Math.sqrt(1 - y * y);
    const radius = 0.025 + Math.pow(random(), 2) * 0.15;
    return {x: Math.cos(angle) * radial, y, z: Math.sin(angle) * radial, radius, edge: 1 - radius * radius * 0.78};
  });
}

const CRATERS = {moon: makeCraters(731, 110), mercury: makeCraters(241, 85), mars: makeCraters(933, 22)};

function craterRelief(key, x, y, z) {
  let relief = 0;
  for (const crater of CRATERS[key]) {
    const dot = x * crater.x + y * crater.y + z * crater.z;
    if (dot < crater.edge) continue;
    const r = Math.sqrt(Math.max(0, 2 - 2 * dot)) / crater.radius;
    // A broad shallow bowl and a narrow smooth ejecta rim, without ink outlines.
    const bowl = -0.19 * Math.exp(-r * r * 3.2);
    const rim = 0.075 * Math.exp(-Math.pow((r - 0.92) * 10, 2));
    relief += (bowl + rim) * smooth(clamp((1.25 - r) * 4));
  }
  return relief;
}

function surface(key, u, v) {
  const longitude = u * TAU;
  const radial = v === 0 || v === 1 ? 0 : Math.sin(v * Math.PI);
  const x = radial * Math.cos(longitude), y = Math.cos(v * Math.PI), z = radial * Math.sin(longitude);
  const seed = key.length + key.charCodeAt(0) * 0.1;
  const broad = noise(x, y, z, 3.2, seed);
  const medium = noise(x, y, z, 14, seed + 3);
  const fine = noise(x, y, z, 53, seed + 7);
  let color, height;

  if (key === 'moon' || key === 'mercury' || key === 'mars') {
    const craters = craterRelief(key, x, y, z);
    const detail = noise(x, y, z, 135, seed + 11);
    height = 0.5 + broad * 0.16 + medium * 0.09 + fine * 0.045 + detail * 0.018 + craters;
    if (key === 'moon') {
      const maria = smooth(clamp((-broad - 0.08) * 3));
      const tone = 159 + broad * 18 + medium * 12 + fine * 6 + detail * 3 - maria * 43 + craters * 18;
      color = [tone * 1.025, tone * 1.015, tone];
    } else if (key === 'mercury') {
      const tone = 140 + broad * 24 + medium * 12 + fine * 7 + detail * 3 + craters * 18;
      color = [tone * 1.07, tone * 1.01, tone * 0.94];
    } else {
      const basalt = smooth(clamp((-broad - medium * 0.25 - 0.03) * 3));
      const dust = medium * 17 + fine * 7 + detail * 3;
      color = [185 + broad * 26 + dust - basalt * 55, 93 + broad * 22 + dust * 0.67 - basalt * 27, 56 + broad * 14 + dust * 0.5 - basalt * 9];
      const ice = smooth(clamp((Math.abs(y) - 0.965 + medium * 0.005) * 70));
      color = color.map((channel, index) => mix(channel, [225, 218, 201][index], ice));
    }
  } else if (key === 'sun') {
    const granules = 1 - Math.abs(noise(x, y, z, 88, 6));
    const cells = smooth(clamp(granules * 1.3 - 0.18));
    const tone = broad * 10 + medium * 9 + fine * 6;
    color = [248 + cells * 7, 131 + cells * 52 + tone, 29 + cells * 30 + tone * 0.4];
    height = 0.35 + cells * 0.35 + medium * 0.1;
  } else if (key === 'venus') {
    const swirl = Math.sin(y * 28 + broad * 4 + medium * 1.1) * 0.5;
    const clouds = broad * 11 + medium * 14 + fine * 5 + swirl * 12;
    color = [217 + clouds * 0.7, 179 + clouds, 112 + clouds * 1.1];
    height = 0.5 + medium * 0.14 + fine * 0.06;
  } else {
    const turbulence = broad * 2.6 + medium * 0.65;
    const latitude = y * 36 + turbulence;
    const bands = Math.sin(latitude) * 0.63 + Math.sin(latitude * 2.14 + 1.3) * 0.24;
    const filaments = Math.sin(y * 157 + broad * 7 + medium * 3) * 0.5 + fine * 0.5;
    height = 0.5 + medium * 0.1 + fine * 0.05 + filaments * 0.035;
    if (key === 'jupiter') {
      const tint = bands * 36 + filaments * 9;
      color = [204 + tint * 0.7 + broad * 5, 172 + tint + medium * 4, 133 + tint * 1.15 + fine * 4];
      // An oval storm with a warm outer collar and curled internal bands.
      const du = Math.atan2(Math.sin((u - 0.67) * TAU), Math.cos((u - 0.67) * TAU));
      const sx = du / 0.34, sy = (v - 0.62) / 0.053;
      const distance = Math.sqrt(sx * sx + sy * sy);
      if (distance < 1.3) {
        const feather = smooth(clamp((1.15 - distance) * 5));
        const curl = Math.sin(Math.atan2(sy, sx) * 2 + distance * 13 + medium * 2);
        const storm = [178 + curl * 15 + fine * 5, 91 + curl * 14, 61 + curl * 9];
        color = color.map((channel, index) => mix(channel, storm[index], feather * radial));
        height += feather * 0.04;
      }
    } else if (key === 'saturn') {
      const tint = bands * 13 + filaments * 3 + medium * 2;
      color = [216 + tint, 192 + tint, 143 + tint * 0.9];
    } else if (key === 'uranus') {
      const tint = bands * 3.5 + medium * 2 + fine;
      color = [145 + tint + fine * 2, 204 + tint * 0.8 + medium * 2, 207 + tint * 0.7 - broad * 2];
    } else {
      const tint = bands * 8 + filaments * 2 + medium * 2;
      color = [48 + tint * 0.5, 105 + tint, 190 + tint * 0.8];
      const cloud = Math.pow(clamp(medium + broad * 0.25 - 0.25), 2) * 65;
      color = color.map((channel) => channel + cloud);
    }
  }
  return {color: color.map((channel) => Math.round(clamp(channel, 0, 255))), height: clamp(height)};
}

/** u wraps around longitude; v is north-to-south in [0, 1]. */
export function sampleSurface(key, u, v) {
  if (!KEYS.has(key)) throw new RangeError('Unknown surface body');
  if (!Number.isFinite(u) || !Number.isFinite(v)) throw new RangeError('Surface coordinates must be finite');
  return surface(key, ((u % 1) + 1) % 1, clamp(v));
}

/** RGBA buffers for CanvasTexture, with grayscale bump and opaque alpha. */
export function createSurfaceData(key, width, height) {
  if (!KEYS.has(key)) throw new RangeError('Unknown surface body');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2048 || height > 2048 || width * height > 2097152) {
    throw new RangeError('Surface dimensions must be positive integers up to 2048 and two million pixels');
  }
  const color = new Uint8ClampedArray(width * height * 4);
  const bump = new Uint8ClampedArray(color.length);
  for (let row = 0; row < height; row++) {
    const v = height === 1 ? 0.5 : row / (height - 1);
    for (let column = 0; column < width; column++) {
      const pixel = surface(key, column / width, v);
      const index = (row * width + column) * 4;
      color[index] = pixel.color[0];
      color[index + 1] = pixel.color[1];
      color[index + 2] = pixel.color[2];
      color[index + 3] = 255;
      const relief = Math.round(pixel.height * 255);
      bump[index] = bump[index + 1] = bump[index + 2] = relief;
      bump[index + 3] = 255;
    }
  }
  return {width, height, color, bump};
}
