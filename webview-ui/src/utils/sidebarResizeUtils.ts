type ComputeSidebarWidthFromKeyOptions = {
  currentWidth: number;
  key: string;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  step?: number;
};

export function computeSidebarWidthFromKey(options: ComputeSidebarWidthFromKeyOptions): number | null {
  const {
    currentWidth,
    key,
    minWidth,
    maxWidth,
    defaultWidth,
    step = 16
  } = options;

  if (key === 'ArrowLeft') {
    return Math.max(minWidth, currentWidth - step);
  }
  if (key === 'ArrowRight') {
    return Math.min(maxWidth, currentWidth + step);
  }
  if (key === 'Home') {
    return minWidth;
  }
  if (key === 'End') {
    return maxWidth;
  }
  if (key === 'Enter' || key === ' ') {
    return defaultWidth;
  }
  return null;
}
