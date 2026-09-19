/** Keep the whole room above the mobile controls without moving any furniture. */
export function overviewFraming(baseFov: number, width: number, height: number) {
  const aspect = Math.max(.1, width / Math.max(1, height));
  const portrait = width <= 760 && aspect < .85;
  const framingAspect = portrait ? 1.15 : 1.6;
  return {
    fov: Math.min(88, Math.atan(Math.tan(baseFov * Math.PI / 360) * Math.max(1, framingAspect / aspect)) * 360 / Math.PI),
    offsetY: portrait ? height * .22 : 0,
  };
}
