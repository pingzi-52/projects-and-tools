import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";

/** Deterministic pseudo-random so every render produces identical pixels. */
const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const PALETTE = [
  "#00e5ff",
  "#ff2e97",
  "#ffd166",
  "#7c4dff",
  "#00ffa3",
  "#ff6b3d",
];

// ---------------------------------------------------------------------------
// Glow.
//
// A real bloom pass needs an extra render target and an `extend()`ed effect
// composer, both of which are brittle under Remotion's headless renderer.
// An additive sprite painted with a radial-gradient canvas texture gets most
// of the look for none of the cost, and it is deterministic: the gradient is
// generated once and cached at module scope.
// ---------------------------------------------------------------------------
let GLOW_TEXTURE: THREE.CanvasTexture | null = null;

const glowTexture = () => {
  if (GLOW_TEXTURE) return GLOW_TEXTURE;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.16, "rgba(255,255,255,0.6)");
  g.addColorStop(0.36, "rgba(255,255,255,0.22)");
  g.addColorStop(0.62, "rgba(255,255,255,0.06)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  GLOW_TEXTURE = tex;
  return tex;
};

const Glow = ({
  size,
  color,
  opacity,
  z = 0,
  order = 12,
  depthTest = false,
}: {
  size: number;
  color: string;
  opacity: number;
  z?: number;
  order?: number;
  /**
   * Halos that sit *behind* solid geometry must keep depth testing on, or the
   * additive sprite paints straight over the mesh and turns it into a soft blob.
   */
  depthTest?: boolean;
}) => (
  <sprite scale={[size, size, 1]} position={[0, 0, z]} renderOrder={order}>
    <spriteMaterial
      map={glowTexture()}
      color={color}
      transparent
      opacity={opacity}
      blending={THREE.AdditiveBlending}
      depthWrite={false}
      depthTest={depthTest}
    />
  </sprite>
);

/**
 * The mouse pointer itself: a classic arrow drawn once into a canvas texture and
 * billboarded as a sprite, so it always faces the camera no matter how the orbit
 * swings. A cone mesh was reading as a "play" triangle from most angles.
 */
let CURSOR_TEXTURE: THREE.CanvasTexture | null = null;

const cursorTexture = () => {
  if (CURSOR_TEXTURE) return CURSOR_TEXTURE;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const pts: [number, number][] = [
    [0.14, 0.08],
    [0.14, 0.76],
    [0.3, 0.6],
    [0.42, 0.9],
    [0.55, 0.84],
    [0.43, 0.55],
    [0.66, 0.55],
  ];
  ctx.beginPath();
  pts.forEach(([x, y], i) =>
    i === 0
      ? ctx.moveTo(x * size, y * size)
      : ctx.lineTo(x * size, y * size),
  );
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = size * 0.045;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  CURSOR_TEXTURE = tex;
  return tex;
};

// ---------------------------------------------------------------------------
// Orbit maths shared by the scene and by the pointer choreography.
// ---------------------------------------------------------------------------
export const orbPosition = (
  index: number,
  t: number,
): [number, number, number] => {
  const r = 3.55 + index * 0.7;
  const speed = 0.52 - index * 0.05;
  const a = index * 1.9 + t * speed;
  const tilt = 0.18 + index * 0.22;
  return [
    Math.cos(a) * r,
    Math.sin(a * 1.7 + index) * tilt * r * 0.45,
    Math.sin(a) * r,
  ];
};

export const cameraPosition = (
  yaw: number,
  pitch: number,
  radius: number,
): [number, number, number] => [
  radius * Math.sin(pitch) * Math.sin(yaw),
  radius * Math.cos(pitch),
  radius * Math.sin(pitch) * Math.cos(yaw),
];

/**
 * Where the pointer should sit to "touch" a target: on the segment between the
 * target and the camera, so the reticle always reads as being on top of it.
 */
export const focusPoint = (
  target: number,
  t: number,
  yaw: number,
  pitch: number,
  radius: number,
): [number, number, number] => {
  const cam = cameraPosition(yaw, pitch, radius);
  const p: [number, number, number] =
    target === 4 ? [0, 0, 0] : orbPosition(target, t);
  const dx = cam[0] - p[0];
  const dy = cam[1] - p[1];
  const dz = cam[2] - p[2];
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const k = target === 4 ? 2.4 : 1.05;
  return [p[0] + (dx / d) * k, p[1] + (dy / d) * k, p[2] + (dz / d) * k];
};

// ---------------------------------------------------------------------------
// Pointer: reticle, arrow, click shockwave.
// ---------------------------------------------------------------------------
export const Cursor = ({
  x,
  y,
  z,
  pressing,
  color,
  t,
}: {
  x: number;
  y: number;
  z: number;
  pressing: number;
  color: string;
  t: number;
}) => {
  const pressed = 1 - 0.3 * Math.sin(Math.min(pressing, 1) * Math.PI);

  return (
    <group position={[x, y, z]}>
      <Glow size={2.6} color={color} opacity={0.22} order={11} />

      {/* outer reticle */}
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={14}>
        <torusGeometry args={[0.34, 0.014, 8, 64]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.9}
          depthTest={false}
        />
      </mesh>

      {/* four rotating ticks */}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          rotation={[Math.PI / 2, 0, (i * Math.PI) / 2 + t * 0.5]}
          renderOrder={14}
        >
          <torusGeometry args={[0.5, 0.012, 6, 10, Math.PI / 7]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.85}
            depthTest={false}
          />
        </mesh>
      ))}

      {/* the pointer arrow, billboarded so it always faces camera */}
      <sprite
        scale={[0.62 * pressed, 0.62 * pressed, 1]}
        position={[0.05, -0.04, 0.05]}
        renderOrder={15}
      >
        <spriteMaterial
          map={cursorTexture()}
          transparent
          opacity={1}
          depthWrite={false}
          depthTest={false}
        />
      </sprite>

      {/* click shockwave */}
      {pressing > 0 && pressing < 1 ? (
        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          scale={0.25 + pressing * 3.4}
          renderOrder={16}
        >
          <ringGeometry args={[0.84, 1, 72]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={(1 - pressing) ** 1.6 * 0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Particle field: round soft points, pushed outward by each click.
// ---------------------------------------------------------------------------
export const Particles = ({
  count = 800,
  cursorX,
  cursorY,
  cursorZ,
  pressAge,
  t,
}: {
  count?: number;
  cursorX: number;
  cursorY: number;
  cursorZ: number;
  pressAge: number;
  t: number;
}) => {
  const ref = useRef<THREE.Points>(null);

  const { positions, base, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const r = 8 + rand(i * 3.1) * 23;
      const theta = rand(i * 1.7) * Math.PI * 2;
      const phi = Math.acos(2 * rand(i * 5.3) - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      const z = r * Math.cos(phi);
      base[i * 3] = x;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = z;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      col.set(PALETTE[Math.floor(rand(i * 9.7) * PALETTE.length)]);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    return { positions, base, colors };
  }, [count]);

  // Deform on the CPU: cheap at <1k points, and fully frame-deterministic.
  const geom = ref.current?.geometry;
  if (geom && geom.attributes.position) {
    const attr = geom.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const push = pressAge > 0 && pressAge < 1 ? (1 - pressAge) ** 2 * 9 : 0;
    for (let i = 0; i < count; i++) {
      const ph = rand(i * 2.3) * Math.PI * 2;
      const spin = t * (0.3 + rand(i * 4.1) * 0.7) + ph;
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const bz = base[i * 3 + 2];
      const cos = Math.cos(spin);
      const sin = Math.sin(spin);
      let x = bx * cos - bz * sin;
      let z = bx * sin + bz * cos;
      let y = by + Math.sin(t * 1.3 + ph) * 1.1;
      if (push > 0) {
        const dx = x - cursorX;
        const dy = y - cursorY;
        const dz = z - cursorZ;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
        const f = push / (1 + d * d * 0.3);
        x += (dx / d) * f;
        y += (dy / d) * f;
        z += (dz / d) * f;
      }
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    attr.needsUpdate = true;
  }

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          usage={THREE.DynamicDrawUsage}
        />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={glowTexture()}
        size={0.16}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

// ---------------------------------------------------------------------------
// Central icosahedron.
// ---------------------------------------------------------------------------
export const Core = ({
  t,
  hover,
  hitAge,
}: {
  t: number;
  hover: number;
  hitAge: number;
}) => {
  const burst = hitAge > 0 && hitAge < 1 ? (1 - hitAge) ** 2 : 0;
  const scale = 1 + burst * 0.3 + hover * 0.1;

  const shards = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const a = rand(i * 4.7) * Math.PI * 2;
        const b = Math.acos(2 * rand(i * 8.1) - 1);
        return { a, b, s: 0.055 + rand(i * 6.2) * 0.08, ph: rand(i * 3.9) };
      }),
    [],
  );

  return (
    <group>
      {/* Halos keep depth testing: they must fall behind the shell, not wash it out. */}
      <Glow
        size={13 + burst * 10}
        color="#1834ff"
        opacity={0.5}
        order={1}
        depthTest
      />
      <Glow
        size={5.4 + burst * 4}
        color="#7aa8ff"
        opacity={0.34}
        order={2}
        depthTest
      />

      {/* faceted shell — detail 1 keeps the facets big enough to catch light */}
      <mesh scale={scale} rotation={[t * 0.26, t * 0.4, 0]}>
        <icosahedronGeometry args={[1.25, 1]} />
        <meshStandardMaterial
          color="#050a1c"
          emissive="#1626a8"
          emissiveIntensity={0.55 + burst * 4}
          metalness={0.92}
          roughness={0.22}
          flatShading
        />
      </mesh>

      {/* inner core seen through the shell */}
      <mesh scale={scale * 0.72} rotation={[-t * 0.3, t * 0.2, 0]}>
        <icosahedronGeometry args={[1.25, 1]} />
        <meshBasicMaterial
          color="#2a5cff"
          transparent
          opacity={0.5 + burst * 0.4}
          wireframe
        />
      </mesh>

      <mesh scale={scale * 1.42} rotation={[-t * 0.2, -t * 0.33, t * 0.1]}>
        <icosahedronGeometry args={[1.25, 1]} />
        <meshBasicMaterial
          color="#00e5ff"
          wireframe
          transparent
          opacity={0.28 + burst * 0.55}
        />
      </mesh>

      {shards.map((s, i) => {
        const r = 3.05 + Math.sin(t * 0.9 + s.ph * 6) * 0.45 + burst * 1.7;
        const ang = s.a + t * (0.5 + s.ph * 0.6);
        return (
          <mesh
            key={i}
            position={[
              Math.cos(ang) * Math.sin(s.b) * r,
              Math.cos(s.b) * r * 0.75,
              Math.sin(ang) * Math.sin(s.b) * r,
            ]}
            rotation={[t * 2 + i, t * 1.3, 0]}
          >
            <tetrahedronGeometry args={[s.s, 0]} />
            <meshBasicMaterial
              color={PALETTE[i % PALETTE.length]}
              transparent
              opacity={0.9}
            />
          </mesh>
        );
      })}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Clickable satellites.
// ---------------------------------------------------------------------------
export const Orb = ({
  index,
  t,
  hitAge,
  hovered,
}: {
  index: number;
  t: number;
  hitAge: number;
  hovered: boolean;
}) => {
  const [x, y, z] = orbPosition(index, t);
  const color = PALETTE[index % PALETTE.length];
  // Short, sharp flash: a full second of white-out reads as a bug, not a click.
  const burst = hitAge > 0 && hitAge < 0.6 ? (1 - hitAge / 0.6) ** 2 : 0;
  const s = (0.25 + index * 0.045) * (1 + burst * 0.9 + (hovered ? 0.22 : 0));

  return (
    <group position={[x, y, z]}>
      <Glow
        size={2.4 + burst * 7 + (hovered ? 1.4 : 0)}
        color={color}
        opacity={0.42 + burst * 0.3}
        order={8}
      />

      <mesh rotation={[t * 0.8 + index, t * 1.1, 0]}>
        <octahedronGeometry args={[s, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.9 + burst * 1.2 + (hovered ? 1.4 : 0)}
          metalness={0.35}
          roughness={0.22}
          flatShading
        />
      </mesh>

      <mesh scale={s * (2.3 + burst * 1.6)} rotation={[t * 0.6, t * 0.4, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={(hovered ? 0.5 : 0.16) + burst * 0.6}
        />
      </mesh>

      {burst > 0 ? (
        <Glow
          size={1.6 + (1 - hitAge / 0.6) * 5}
          color="#ffffff"
          opacity={burst * 0.3}
          order={9}
        />
      ) : null}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Floor grid + click shock rings.
// ---------------------------------------------------------------------------
export const Floor = ({ pressAge }: { pressAge: number }) => (
  <group position={[0, -5.5, 0]}>
    <gridHelper args={[46, 46, "#1d47ff", "#0a1a42"]} />
    {[0, 0.33, 0.66].map((off, i) =>
      pressAge > off && pressAge < 1 ? (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={0.6 + (pressAge - off) * 13}
          position={[0, 0.03 + i * 0.01, 0]}
        >
          <ringGeometry args={[0.95, 1, 96, 1]} />
          <meshBasicMaterial
            color={i === 0 ? "#ffffff" : PALETTE[i + 1]}
            transparent
            opacity={(1 - (pressAge - off)) ** 2 * 0.28}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null,
    )}
  </group>
);

// ---------------------------------------------------------------------------
// Lights.
// ---------------------------------------------------------------------------
export const Lights = ({
  t,
  cursorX,
  cursorY,
  cursorZ,
}: {
  t: number;
  cursorX: number;
  cursorY: number;
  cursorZ: number;
}) => (
  <>
    <ambientLight intensity={0.6} />
    <directionalLight position={[6, 8, 6]} intensity={1.5} color="#cfe4ff" />
    <pointLight
      position={[Math.cos(t * 0.8) * 9, 5, Math.sin(t * 0.8) * 9]}
      intensity={60}
      distance={32}
      color="#ff2e97"
    />
    <pointLight
      position={[Math.cos(t * 0.8 + Math.PI) * 9, -4, Math.sin(t * 0.8 + Math.PI) * 9]}
      intensity={60}
      distance={32}
      color="#00e5ff"
    />
    <pointLight
      position={[cursorX, cursorY, cursorZ + 1.5]}
      intensity={22}
      distance={16}
      color="#ffffff"
    />
  </>
);

// ---------------------------------------------------------------------------
// Camera rig.
//
// The camera is positioned from a spherical coordinate every frame and then
// aimed with `lookAt`. Doing the maths by hand (an Euler triple) is what broke
// the framing before: three's default XYZ order does not compose yaw-then-pitch
// the way a spherical orbit needs. `lookAt` cannot get it wrong.
// ---------------------------------------------------------------------------
export const CameraRig = ({
  yaw,
  pitch,
  radius,
  fov = 46,
}: {
  yaw: number;
  pitch: number;
  radius: number;
  fov?: number;
}) => {
  const { camera } = useThree();
  const [x, y, z] = cameraPosition(yaw, pitch, radius);
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
  const cam = camera as THREE.PerspectiveCamera;
  if (cam.fov !== fov) {
    cam.fov = fov;
  }
  cam.updateProjectionMatrix();
  return null;
};
