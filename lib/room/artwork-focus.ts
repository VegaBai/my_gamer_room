/** Free preview area alongside the control-panel breakpoints in globals.css. */
export function artworkViewport(width: number, height: number) {
  const mobile = width <= 760;
  const left = mobile ? 12 : 24;
  const right = mobile ? width - 12 : width - Math.min(38, Math.max(18, width * .03)) - 330 - 24;
  const top = mobile ? 94 : height <= 680 ? 86 : 104;
  const bottom = mobile ? height * .52 - (width <= 480 ? 112 : 78) - 20 : height - 100;
  const availableWidth = Math.max(64, right - left);
  const availableHeight = Math.max(64, bottom - top);
  return {
    width: availableWidth,
    height: availableHeight,
    centerX: left + availableWidth / 2,
    centerY: top + availableHeight / 2,
  };
}
