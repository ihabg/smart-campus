export function dijkstra(graph, start, end) {
  if (!graph || !start || !end) return null;
  if (start === end) return [start];

  const dist    = {};
  const prev    = {};
  const visited = new Set();
  const queue   = new Set(Object.keys(graph));

  queue.add(start); queue.add(end);
  queue.forEach(id => { dist[id] = Infinity; prev[id] = null; });
  dist[start] = 0;

  while (queue.size > 0) {
    let u = null;
    queue.forEach(id => { if (u === null || (dist[id] ?? Infinity) < (dist[u] ?? Infinity)) u = id; });
    if (!u || dist[u] === Infinity) break;
    if (u === end) break;
    queue.delete(u);
    visited.add(u);

    for (const { id: v, weight } of (graph[u] || [])) {
      if (visited.has(v)) continue;
      const alt = dist[u] + (weight || 1);
      if (alt < (dist[v] ?? Infinity)) { dist[v] = alt; prev[v] = u; queue.add(v); }
    }
  }

  if (!dist[end] || dist[end] === Infinity) return null;
  const path = [];
  let cur = end;
  while (cur) { path.unshift(cur); cur = prev[cur]; }
  return path.length > 1 ? path : null;
}
