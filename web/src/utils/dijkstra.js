/**
 * Dijkstra's shortest path algorithm.
 * Works on the graph object returned by GET /api/search/graph
 *
 * @param {Object} graph  — { roomId: [{id, weight}] }
 * @param {string} start  — source room ID
 * @param {string} end    — target room ID
 * @returns {string[]|null} ordered room IDs, or null if no path exists
 */
export function dijkstra(graph, start, end) {
  if (!graph || !start || !end) return null;
  if (start === end) return [start];

  const dist    = {};
  const prev    = {};
  const visited = new Set();

  Object.keys(graph).forEach(id => {
    dist[id] = Infinity;
    prev[id] = null;
  });
  dist[start] = 0;

  const queue = new Set(Object.keys(graph));
  queue.add(start);
  queue.add(end);

  while (queue.size > 0) {
    // Pick the node with the smallest known distance
    let u = null;
    queue.forEach(id => {
      if (u === null || (dist[id] ?? Infinity) < (dist[u] ?? Infinity)) u = id;
    });

    if (u === null || dist[u] === Infinity) break;
    if (u === end) break;

    queue.delete(u);
    visited.add(u);

    const neighbours = graph[u] || [];
    for (const { id: v, weight } of neighbours) {
      if (visited.has(v)) continue;
      const alt = dist[u] + (weight || 1);
      if (alt < (dist[v] ?? Infinity)) {
        dist[v] = alt;
        prev[v] = u;
        queue.add(v);
      }
    }
  }

  if (dist[end] === Infinity || dist[end] === undefined) return null;

  const path = [];
  let cur = end;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev[cur];
  }

  return path.length > 1 ? path : null;
}

/**
 * Format a path array into a human-readable string.
 */
export function formatPath(path, nodes) {
  if (!path || !nodes) return '';
  return path.map(id => nodes[id]?.number || id).join(' → ');
}

/**
 * Calculate estimated walking distance of a path.
 * Uses straight-line distance between node coordinates.
 */
export function pathDistance(path, nodes) {
  if (!path || path.length < 2 || !nodes) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = nodes[path[i]];
    const b = nodes[path[i + 1]];
    if (a?.x != null && b?.x != null) {
      total += Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
    } else {
      total += 1; // fallback unit cost
    }
  }
  return Math.round(total);
}
