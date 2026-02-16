export function getNextSidebarTabIndex(currentIndex: number, key: string, totalTabs: number): number | null {
  if (totalTabs <= 0) return null;
  if (key === 'ArrowRight') {
    return (currentIndex + 1 + totalTabs) % totalTabs;
  }
  if (key === 'ArrowLeft') {
    return (currentIndex - 1 + totalTabs) % totalTabs;
  }
  if (key === 'Home') {
    return 0;
  }
  if (key === 'End') {
    return totalTabs - 1;
  }
  return null;
}
