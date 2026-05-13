// web/src/data/navigation/pathfinding.js

export function distance(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  return Math.sqrt(dx * dx + dy * dy);
}

export function buildGraph(nodes, edges, options = {}) {
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const graph = new Map();

  nodes.forEach(node => {
    graph.set(node.id, []);
  });

  edges.forEach(edge => {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);

    if (!fromNode || !toNode) return;

    let cost = edge.weight ?? distance(fromNode, toNode);

    if (edge.type === 'stairs') cost += 25;
    if (edge.type === 'elevator') cost += 8;
    if (edge.type === 'emergency_stairs') cost += options.emergencyMode ? 0 : 90;

    if (options.accessibleOnly) {
      if (edge.accessible === false) return;
      if (fromNode.accessible === false || toNode.accessible === false) return;
      if (edge.type === 'stairs' || edge.type === 'emergency_stairs') return;
    }

    graph.get(edge.from).push({
      to: edge.to,
      cost,
      type: edge.type || 'walk',
    });

    if (edge.bidirectional !== false) {
      graph.get(edge.to).push({
        to: edge.from,
        cost,
        type: edge.type || 'walk',
      });
    }
  });

  return { graph, nodeMap };
}

function reconstructPath(cameFrom, currentId, nodeMap) {
  const path = [nodeMap.get(currentId)];

  while (cameFrom.has(currentId)) {
    currentId = cameFrom.get(currentId);
    path.unshift(nodeMap.get(currentId));
  }

  return path;
}

export function aStarSearch({
  nodes,
  edges,
  startNodeId,
  targetNodeId,
  accessibleOnly = false,
  emergencyMode = false,
}) {
  const { graph, nodeMap } = buildGraph(nodes, edges, {
    accessibleOnly,
    emergencyMode,
  });

  if (!nodeMap.has(startNodeId)) {
    return {
      success: false,
      message: `Invalid start node: ${startNodeId}`,
      path: [],
    };
  }

  if (!nodeMap.has(targetNodeId)) {
    return {
      success: false,
      message: `Invalid target node: ${targetNodeId}`,
      path: [],
    };
  }

  const startNode = nodeMap.get(startNodeId);
  const targetNode = nodeMap.get(targetNodeId);

  const openSet = new Set([startNodeId]);
  const cameFrom = new Map();

  const gScore = new Map();
  const fScore = new Map();

  nodes.forEach(node => {
    gScore.set(node.id, Infinity);
    fScore.set(node.id, Infinity);
  });

  gScore.set(startNodeId, 0);
  fScore.set(startNodeId, distance(startNode, targetNode));

  while (openSet.size > 0) {
    let currentId = null;
    let bestScore = Infinity;

    openSet.forEach(nodeId => {
      const score = fScore.get(nodeId);

      if (score < bestScore) {
        bestScore = score;
        currentId = nodeId;
      }
    });

    if (currentId === targetNodeId) {
      const path = reconstructPath(cameFrom, currentId, nodeMap);

      return {
        success: true,
        path,
        distance: Math.round(gScore.get(currentId)),
      };
    }

    openSet.delete(currentId);

    const neighbors = graph.get(currentId) || [];

    neighbors.forEach(edge => {
      const tentativeScore = gScore.get(currentId) + edge.cost;

      if (tentativeScore < gScore.get(edge.to)) {
        cameFrom.set(edge.to, currentId);
        gScore.set(edge.to, tentativeScore);
        fScore.set(
          edge.to,
          tentativeScore + distance(nodeMap.get(edge.to), targetNode)
        );
        openSet.add(edge.to);
      }
    });
  }

  return {
    success: false,
    message: 'No route found.',
    path: [],
  };
}