export function clampPos(
  x: number,
  y: number,
  w: number,
  h: number,
  winW: number,
  winH: number,
) {
  return {
    x: Math.max(8, Math.min(winW - w - 8, x)),
    y: Math.max(8, Math.min(winH - h - 8, y)),
  };
}
