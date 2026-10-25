// Shared ground dimensions: rendering and simulation checks use the same map.
export const WORLD_SIZE = 110;
export const WORLD_CORNER = 16;
export function onIsland(x, z, margin = 0) {
  const h = WORLD_SIZE / 2 - margin, r = WORLD_CORNER - margin;
  const qx = Math.max(Math.abs(x) - (h - r), 0), qz = Math.max(Math.abs(z) - (h - r), 0);
  return Math.abs(x) < h && Math.abs(z) < h && Math.hypot(qx, qz) < r;
}

// Fishing lake in the pier's local frame. The wooden deck is walkable.
export const LAKE = { halfWidth: 7, front: 1, back: -7, pierWidth: 3, pierBack: -3.4 };
export const inFishingWater = (x, z) => Math.abs(x) < LAKE.halfWidth && z < LAKE.front && z > LAKE.back && (Math.abs(x) > LAKE.pierWidth || z < LAKE.pierBack);
