export function getNextQuickAddIndex(currentIndex: number, key: string, totalItems: number): number | null {
  if (totalItems <= 0) return 0;
  if (key === 'ArrowDown') {
    return Math.min(totalItems - 1, currentIndex + 1);
  }
  if (key === 'ArrowUp') {
    return Math.max(0, currentIndex - 1);
  }
  return null;
}

export function resolveQuickAddSubmitIndex(activeIndex: number, totalItems: number): number | null {
  if (totalItems <= 0) return null;
  return Math.min(Math.max(0, activeIndex), totalItems - 1);
}
