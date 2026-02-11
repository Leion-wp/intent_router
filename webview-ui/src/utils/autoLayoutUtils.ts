type LayoutPosition = { x: number; y: number };

type AutoLayoutOptions = {
  baseX?: number;
  baseY?: number;
  xSpacing?: number;
};

export function computeHorizontalAutoLayout(
  nodes: Array<{ id: string; position?: LayoutPosition }>,
  edges: Array<{ source: string; target: string }>,
  options?: AutoLayoutOptions
): Map<string, LayoutPosition> {
  const baseX = Number(options?.baseX ?? 250);
  const baseY = Number(options?.baseY ?? 50);
  const xSpacing = Number(options?.xSpacing ?? 320);

  const ids = nodes.map((node) => node.id);
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  ids.forEach((id) => {
    adj.set(id, []);
    inDegree.set(id, 0);
  });

  edges.forEach((edge) => {
    if (!adj.has(edge.source) || !adj.has(edge.target)) return;
    adj.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  });

  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });

  const order: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    order.push(current);
    (adj.get(current) || []).forEach((neighbor) => {
      inDegree.set(neighbor, (inDegree.get(neighbor)! - 1));
      if (inDegree.get(neighbor) === 0) queue.push(neighbor);
    });
  }

  const sorted = order.length === ids.length ? order : ids;
  const indexById = new Map<string, number>();
  sorted.forEach((id, index) => indexById.set(id, index));

  const nextPositions = new Map<string, LayoutPosition>();
  nodes.forEach((node) => {
    const index = indexById.get(node.id);
    if (index === undefined) return;
    const y = node.id === 'start' ? baseY : Number(node.position?.y ?? baseY);
    nextPositions.set(node.id, { x: baseX + index * xSpacing, y });
  });

  return nextPositions;
}
