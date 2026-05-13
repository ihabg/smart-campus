// web/src/data/navigation/b2Navigation.js

// B2 indoor navigation graph
// Red points = nodes
// Black lines = edges
// Rooms are NOT walkable
// Route only follows corridor/edge lines

export const B2_NAV_NODES = [
  // ─────────────────────────────────────────────
  // Main start / facility nodes
  // ─────────────────────────────────────────────
  {
    id: 'B2_LEFT_STAIRS',
    label: 'Emergency Stairs — درج الطوارئ',
    x: 200,
    y: 320,
    type: 'emergency_stairs',
    accessible: false,
    roomNumber: 'B2-STAIRS-1',
  },
  {
    id: 'B2_ACCESSIBLE_RESTROOM',
    label: 'Accessible Restroom — دورة مياه لذوي الإعاقة',
    x: 185,
    y: 362,
    type: 'bathroom',
    accessible: true,
    roomNumber: 'B2-DISABLED-RESTROOM',
  },
  {
    id: 'B2_ELEVATOR',
    label: 'Elevator — المصعد',
    x: 522,
    y: 330,
    type: 'elevator',
    accessible: true,
    roomNumber: 'B2-ELEVATOR',
  },
  {
    id: 'B2_INTERNAL_STAIRS',
    label: 'Internal Stairs — درج داخلي',
    x: 545,
    y: 470,
    type: 'stairs',
    accessible: false,
    roomNumber: 'B2-INTERNAL-STAIRS',
  },
  {
    id: 'B2_M_RESTROOM',
    label: 'Men Restroom — دورة مياه رجال',
    x: 620,
    y: 365,
    type: 'restroom',
    accessible: true,
    roomNumber: 'B2-M-RESTROOM',
  },
  {
    id: 'B2_W_RESTROOM',
    label: 'Women Restroom — دورة مياه نساء',
    x: 640,
    y: 425,
    type: 'restroom',
    accessible: true,
    roomNumber: 'B2-W-RESTROOM',
  },

  // ─────────────────────────────────────────────
  // Corridor nodes based on your black-line drawing
  // ─────────────────────────────────────────────
  {
    id: 'B2_TOP_CORRIDOR_LEFT',
    label: 'Left Corridor',
    x: 340,
    y: 400,
    type: 'corridor',
    accessible: true,
  },
  {
    id: 'B2_TOP_CORRIDOR_B2050',
    label: 'B2050 Corridor Point',
    x: 329,
    y: 361,
    type: 'corridor',
    accessible: true,
  },
  {
    id: 'B2_TOP_CORRIDOR_B2040',
    label: 'B2040 Corridor Point',
    x: 335,
    y: 360,
    type: 'corridor',
    accessible: true,
  },
  {
    id: 'B2_TOP_CORRIDOR_CENTER',
    label: 'Main Corridor',
    x: 523,
    y: 360,
    type: 'corridor',
    accessible: true,
  },
  {
    id: 'B2_TOP_CORRIDOR_ELEVATOR',
    label: 'Elevator Corridor Point',
    x: 522,
    y: 390,
    type: 'corridor',
    accessible: true,
  },
  {
    id: 'B2_TOP_CORRIDOR_RIGHT',
    label: 'Right Corridor',
    x: 620,
    y: 430,
    type: 'corridor',
    accessible: true,
  },

  // Left vertical corridor near B2080/B2090
  {
    id: 'B2_LEFT_VERTICAL_TOP',
    label: 'Left Vertical Corridor Top',
    x: 290,
    y: 400,
    type: 'corridor',
    accessible: true,
  },
  {
    id: 'B2_LEFT_VERTICAL_MID',
    label: 'Left Vertical Corridor Middle',
    x: 290,
    y: 560,
    type: 'corridor',
    accessible: true,
  },
  {
    id: 'B2_LEFT_VERTICAL_BOTTOM',
    label: 'Left Vertical Corridor Bottom',
    x: 230,
    y: 560,
    type: 'corridor',
    accessible: true,
  },

  // Center vertical corridor to B2100
  {
    id: 'B2_CENTER_VERTICAL_TOP',
    label: 'Center Vertical Corridor Top',
    x: 455,
    y: 330,
    type: 'corridor',
    accessible: true,
  },
  {
    id: 'B2_CENTER_VERTICAL_MID',
    label: 'Center Vertical Corridor Middle',
    x: 455,
    y: 475,
    type: 'corridor',
    accessible: true,
  },
  {
    id: 'B2_CENTER_VERTICAL_BOTTOM',
    label: 'Center Vertical Corridor Bottom',
    x: 455,
    y: 610,
    type: 'corridor',
    accessible: true,
  },

  // Right corridor to restrooms/stairs
  {
    id: 'B2_RESTROOM_CORRIDOR_TOP',
    label: 'Restroom Corridor Top',
    x: 620,
    y: 420,
    type: 'corridor',
    accessible: true,
  },
  {
    id: 'B2_RESTROOM_CORRIDOR_BOTTOM',
    label: 'Restroom Corridor Bottom',
    x: 620,
    y: 445,
    type: 'corridor',
    accessible: true,
  },
  {
    id: 'B2_STAIRS_CORRIDOR_POINT',
    label: 'Internal Stairs Corridor Point',
    x: 545,
    y: 425,
    type: 'corridor',
    accessible: true,
  },

  // ─────────────────────────────────────────────
  // Room door nodes
  // These are destination points, not room interiors
  // ─────────────────────────────────────────────
  {
    id: 'B2050_DOOR',
    label: 'B2050 Door',
    x: 315,
    y: 325,
    type: 'door',
    accessible: true,
    roomNumber: 'B2050',
  },
  {
    id: 'B2040_DOOR',
    label: 'B2040 Door',
    x: 355,
    y: 325,
    type: 'door',
    accessible: true,
    roomNumber: 'B2040',
  },
  {
    id: 'B2080_DOOR',
    label: 'B2080 Door',
    x: 220,
    y: 405,
    type: 'door',
    accessible: true,
    roomNumber: 'B2080',
  },
  {
    id: 'B2090_DOOR',
    label: 'B2090 Door',
    x: 230,
    y: 560,
    type: 'door',
    accessible: true,
    roomNumber: 'B2090',
  },
  {
    id: 'B2100_DOOR',
    label: 'B2100 Door',
    x: 455,
    y: 610,
    type: 'door',
    accessible: true,
    roomNumber: 'B2100',
  },
];

export const B2_NAV_EDGES = [
  // ─────────────────────────────────────────────
  // Entrance/stairs/accessible restroom into corridor
  // ─────────────────────────────────────────────
  {
    from: 'B2_LEFT_STAIRS',
    to: 'B2_TOP_CORRIDOR_LEFT',
    type: 'emergency_stairs',
    accessible: false,
  },
  {
    from: 'B2_ACCESSIBLE_RESTROOM',
    to: 'B2_TOP_CORRIDOR_LEFT',
    type: 'walk',
    accessible: true,
  },

  // ─────────────────────────────────────────────
  // Main top corridor: left → right
  // This is the long black line you drew
  // ─────────────────────────────────────────────
  {
    from: 'B2_TOP_CORRIDOR_LEFT',
    to: 'B2_TOP_CORRIDOR_B2050',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_TOP_CORRIDOR_B2050',
    to: 'B2_TOP_CORRIDOR_B2040',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_TOP_CORRIDOR_B2040',
    to: 'B2_TOP_CORRIDOR_CENTER',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_TOP_CORRIDOR_CENTER',
    to: 'B2_TOP_CORRIDOR_ELEVATOR',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_TOP_CORRIDOR_ELEVATOR',
    to: 'B2_TOP_CORRIDOR_RIGHT',
    type: 'walk',
    accessible: true,
  },

  // ─────────────────────────────────────────────
  // Room doors from top corridor
  // ─────────────────────────────────────────────
  {
    from: 'B2_TOP_CORRIDOR_B2050',
    to: 'B2050_DOOR',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_TOP_CORRIDOR_B2040',
    to: 'B2040_DOOR',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_TOP_CORRIDOR_ELEVATOR',
    to: 'B2_ELEVATOR',
    type: 'elevator',
    accessible: true,
  },

  // ─────────────────────────────────────────────
  // Left vertical corridor to B2080 / B2090
  // ─────────────────────────────────────────────
  {
    from: 'B2_TOP_CORRIDOR_LEFT',
    to: 'B2_LEFT_VERTICAL_TOP',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_LEFT_VERTICAL_TOP',
    to: 'B2_LEFT_VERTICAL_MID',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_LEFT_VERTICAL_MID',
    to: 'B2_LEFT_VERTICAL_BOTTOM',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_LEFT_VERTICAL_TOP',
    to: 'B2080_DOOR',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_LEFT_VERTICAL_BOTTOM',
    to: 'B2090_DOOR',
    type: 'walk',
    accessible: true,
  },

  // ─────────────────────────────────────────────
  // Center vertical corridor to B2100
  // ─────────────────────────────────────────────
  {
    from: 'B2_TOP_CORRIDOR_CENTER',
    to: 'B2_CENTER_VERTICAL_TOP',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_CENTER_VERTICAL_TOP',
    to: 'B2_CENTER_VERTICAL_MID',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_CENTER_VERTICAL_MID',
    to: 'B2_CENTER_VERTICAL_BOTTOM',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_CENTER_VERTICAL_BOTTOM',
    to: 'B2100_DOOR',
    type: 'walk',
    accessible: true,
  },

  // ─────────────────────────────────────────────
  // Restroom / internal stairs side
  // ─────────────────────────────────────────────
  {
    from: 'B2_TOP_CORRIDOR_RIGHT',
    to: 'B2_RESTROOM_CORRIDOR_TOP',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_RESTROOM_CORRIDOR_TOP',
    to: 'B2_RESTROOM_CORRIDOR_BOTTOM',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_RESTROOM_CORRIDOR_TOP',
    to: 'B2_M_RESTROOM',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_RESTROOM_CORRIDOR_BOTTOM',
    to: 'B2_W_RESTROOM',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_RESTROOM_CORRIDOR_BOTTOM',
    to: 'B2_STAIRS_CORRIDOR_POINT',
    type: 'walk',
    accessible: true,
  },
  {
    from: 'B2_STAIRS_CORRIDOR_POINT',
    to: 'B2_INTERNAL_STAIRS',
    type: 'stairs',
    accessible: false,
  },
];

export const B2_START_NODES = [
  {
    value: 'B2_LEFT_STAIRS',
    label: 'Emergency Stairs — درج الطوارئ',
  },
  {
    value: 'B2_ACCESSIBLE_RESTROOM',
    label: 'Accessible Restroom Area — دورة مياه لذوي الإعاقة',
  },
  {
    value: 'B2_TOP_CORRIDOR_LEFT',
    label: 'Left Corridor — الممر الأيسر',
  },
  {
    value: 'B2_TOP_CORRIDOR_CENTER',
    label: 'Main Corridor — الممر الرئيسي',
  },
  {
    value: 'B2_ELEVATOR',
    label: 'Elevator — المصعد',
  },
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function distance(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  return Math.sqrt(dx * dx + dy * dy);
}

function getNodeMap() {
  return new Map(B2_NAV_NODES.map(node => [node.id, node]));
}

function getRoomNodeId(roomNumber) {
  const node = B2_NAV_NODES.find(item => item.roomNumber === roomNumber);
  return node?.id || null;
}

function getEdgeCost(edge, fromNode, toNode, options = {}) {
  let cost = edge.weight ?? distance(fromNode, toNode);

  if (edge.type === 'stairs') cost += 25;
  if (edge.type === 'elevator') cost += 8;
  if (edge.type === 'emergency_stairs') {
    cost += options.emergencyMode ? 0 : 90;
  }

  if (options.accessibleOnly) {
    if (edge.accessible === false) return Infinity;
    if (edge.type === 'stairs' || edge.type === 'emergency_stairs') return Infinity;
    if (fromNode.accessible === false || toNode.accessible === false) return Infinity;
  }

  return cost;
}

function buildGraph(options = {}) {
  const nodeMap = getNodeMap();
  const graph = new Map();

  B2_NAV_NODES.forEach(node => {
    graph.set(node.id, []);
  });

  B2_NAV_EDGES.forEach(edge => {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);

    if (!fromNode || !toNode) return;

    const forwardCost = getEdgeCost(edge, fromNode, toNode, options);
    const backwardCost = getEdgeCost(edge, toNode, fromNode, options);

    if (Number.isFinite(forwardCost)) {
      graph.get(edge.from).push({
        to: edge.to,
        cost: forwardCost,
        type: edge.type || 'walk',
      });
    }

    if (edge.bidirectional !== false && Number.isFinite(backwardCost)) {
      graph.get(edge.to).push({
        to: edge.from,
        cost: backwardCost,
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

function aStarSearch({
  startNodeId,
  targetNodeId,
  accessibleOnly = false,
  emergencyMode = false,
}) {
  const { graph, nodeMap } = buildGraph({
    accessibleOnly,
    emergencyMode,
  });

  if (!nodeMap.has(startNodeId)) {
    return {
      success: false,
      message: `Invalid B2 start node: ${startNodeId}`,
      path: [],
    };
  }

  if (!nodeMap.has(targetNodeId)) {
    return {
      success: false,
      message: `Invalid B2 target node: ${targetNodeId}`,
      path: [],
    };
  }

  const startNode = nodeMap.get(startNodeId);
  const targetNode = nodeMap.get(targetNodeId);

  if (accessibleOnly && startNode.accessible === false) {
    return {
      success: false,
      message: 'This start point is not accessible. Choose Elevator or Accessible Restroom Area.',
      path: [],
    };
  }

  const openSet = new Set([startNodeId]);
  const cameFrom = new Map();

  const gScore = new Map();
  const fScore = new Map();

  B2_NAV_NODES.forEach(node => {
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
    message: 'No valid B2 route found.',
    path: [],
  };
}

function buildInstructions(path, targetRoomNumber) {
  if (!path || path.length === 0) return [];

  if (path.length === 1) {
    return [`You are already at ${targetRoomNumber || path[0].label}.`];
  }

  const first = path[0];
  const last = path[path.length - 1];

  const instructions = [
    `Start from ${first.label}.`,
    'Follow the highlighted corridor path only.',
  ];

  const hasElevator = path.some(node => node.type === 'elevator');
  const hasStairs = path.some(
    node => node.type === 'stairs' || node.type === 'emergency_stairs'
  );

  if (hasElevator) {
    instructions.push('Pass by the elevator area.');
  }

  if (hasStairs) {
    instructions.push('Use the stairs connection carefully.');
  }

  instructions.push(`Arrive at ${targetRoomNumber || last.roomNumber || last.label}.`);

  return instructions;
}

export function findB2Route({
  fromNodeId = 'B2_LEFT_STAIRS',
  toRoomNumber,
  accessibleOnly = false,
  emergencyMode = false,
}) {
  const targetNodeId = getRoomNodeId(toRoomNumber);

  if (!targetNodeId) {
    return {
      success: false,
      message: `No B2 navigation node found for ${toRoomNumber}.`,
      path: [],
      points: [],
      instructions: [],
    };
  }

  const result = aStarSearch({
    startNodeId: fromNodeId,
    targetNodeId,
    accessibleOnly,
    emergencyMode,
  });

  if (!result.success) {
    return {
      success: false,
      message: result.message || `No route found to ${toRoomNumber}.`,
      path: [],
      points: [],
      instructions: [],
    };
  }

  const path = result.path.map(node => ({
    id: node.id,
    label: node.label,
    x: node.x,
    y: node.y,
    type: node.type,
    roomNumber: node.roomNumber || null,
  }));

  return {
    success: true,
    floor: 'B2',
    algorithm: 'A*',
    path,
    points: path,
    distance: result.distance,
    instructions: buildInstructions(path, toRoomNumber),
  };
}