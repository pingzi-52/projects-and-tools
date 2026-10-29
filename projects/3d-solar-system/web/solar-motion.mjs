/** Shared animation and framing math; all angles returned here are radians. */
function nonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`);
}

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
}

/** Exponential interpolation weight, independent of display refresh rate. */
export function dampingFactor(rate, dt) {
  nonnegative(rate, 'rate');
  nonnegative(dt, 'dt');
  return dt === 0 || rate === 0 ? 0 : -Math.expm1(-rate * dt);
}

/**
 * Fit a bounding sphere into a centered available viewport region.
 * radius includes rings. The caller positions the camera target at that region's
 * screen center; this function only computes the required camera distance.
 */
export function frameDistance({ radius, verticalFovDegrees, viewportWidth, viewportHeight, availableWidth, availableHeight, fill = 0.78 }) {
  for (const [name, value] of Object.entries({ radius, viewportWidth, viewportHeight, availableWidth, availableHeight, fill })) positive(value, name);
  if (!Number.isFinite(verticalFovDegrees) || verticalFovDegrees <= 0 || verticalFovDegrees >= 180) throw new RangeError('verticalFovDegrees must be between 0 and 180');
  if (availableWidth > viewportWidth || availableHeight > viewportHeight) throw new RangeError('available dimensions cannot exceed the viewport');
  if (fill > 1) throw new RangeError('fill cannot exceed 1');

  const verticalTangent = Math.tan(verticalFovDegrees * Math.PI / 360);
  const availableVerticalTangent = verticalTangent * availableHeight / viewportHeight * fill;
  const availableHorizontalTangent = verticalTangent * availableWidth / viewportHeight * fill;
  const halfAngle = Math.atan(Math.min(availableVerticalTangent, availableHorizontalTangent));
  return radius / Math.sin(halfAngle);
}

/** Retain the demo's compressed spin speeds while respecting retrograde periods. */
export function spinDelta(rotHours, simDt) {
  if (!Number.isFinite(rotHours) || rotHours === 0) throw new RangeError('rotHours must be finite and nonzero');
  nonnegative(simDt, 'simDt');
  if (simDt === 0) return 0;
  return Math.sign(rotHours) * simDt * (0.9 + 6 / Math.abs(rotHours)) * 0.6;
}

/**
 * The moon starts on local -X with its +X face toward Earth. Its orbit parent
 * rotates both position and orientation, so a fixed local yaw gives tidal lock.
 */
export function moonLocalSpin() {
  return 0;
}

/** Use untruncated wall-clock seconds, independently of simulation speed. */
export function computeFps(frames, elapsed) {
  if (!Number.isSafeInteger(frames) || frames < 0) throw new RangeError('frames must be a nonnegative safe integer');
  nonnegative(elapsed, 'elapsed');
  return elapsed === 0 ? 0 : frames / elapsed;
}

/**
 * Small-target fallback after visible mesh raycasting misses. All coordinates
 * and radii are CSS pixels; depth is projected NDC z. Equal distances preserve
 * candidate order. Large objects receive no oversized invisible hit sphere.
 */
export function pickScreenTarget(candidates, pointer, minimumRadius = 10) {
  nonnegative(minimumRadius, 'minimumRadius');
  if (!Array.isArray(candidates) || !pointer || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return null;
  let nearestKey = null;
  let nearestDistance = Infinity;
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.key !== 'string' || !candidate.key) continue;
    const { x, y, radius, depth } = candidate;
    if (![x, y, radius, depth].every(Number.isFinite) || radius < 0 || depth < -1 || depth > 1) continue;
    const distance = Math.hypot(x - pointer.x, y - pointer.y);
    const hitRadius = Math.max(minimumRadius, Math.min(radius + 3, 14));
    if (distance <= hitRadius && distance < nearestDistance) {
      nearestDistance = distance;
      nearestKey = candidate.key;
    }
  }
  return nearestKey;
}
