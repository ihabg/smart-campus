const G_NAV_NODES = [
  // ─────────────────────────────────────────────
  // Main entrances
  // ─────────────────────────────────────────────
  {
    id: 'G_NORTH_ENTRANCE_NODE',
    label: 'North Entrance — المدخل الشمالي',
    x: 780,
    y: 700,
    type: 'entrance',
    isAccessible: true,
  },
  {
    id: 'G_NORTH_LOBBY',
    label: 'North Entrance Lobby',
    x: 780,
    y: 700,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_SOUTH_ENTRANCE_NODE',
    label: 'South Entrance — المدخل الجنوبي',
    x: 1230,
    y: 215,
    type: 'entrance',
    isAccessible: true,
  },
  {
    id: 'G_SOUTH_ENTRANCE_CORRIDOR',
    label: 'South Entrance Corridor',
    x: 1290,
    y: 315,
    type: 'corridor',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Central walking network / around middle court
  // ─────────────────────────────────────────────
  {
    id: 'G_CENTER_CORE',
    label: 'Center Core',
    x: 780,
    y: 500,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_CENTER_LEFT_RING',
    label: 'Center Left Ring',
    x: 700,
    y: 500,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_CENTER_RIGHT_RING',
    label: 'Center Right Ring',
    x: 1090,
    y: 555,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_LEFT_VERTICAL',
    label: 'Left Vertical Corridor',
    x: 505,
    y: 445,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_RIGHT_VERTICAL',
    label: 'Right Vertical Corridor',
    x: 1085,
    y: 445,
    type: 'corridor',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Top main corridor
  // ─────────────────────────────────────────────
  {
    id: 'G_TOP_LEFT_WING',
    label: 'Top Left Wing',
    x: 170,
    y: 350,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_TOP_LEFT_MID',
    label: 'Top Left Middle',
    x: 330,
    y: 350,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_TOP_LEFT_JUNCTION',
    label: 'Top Left Junction',
    x: 505,
    y: 350,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_TOP_CENTER_LEFT',
    label: 'Top Center Left',
    x: 600,
    y: 350,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_TOP_CENTER',
    label: 'Top Center',
    x: 765,
    y: 350,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_TOP_CENTER_RIGHT',
    label: 'Top Center Right',
    x: 930,
    y: 350,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_TOP_RIGHT_JUNCTION',
    label: 'Top Right Junction',
    x: 1130,
    y: 430,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_TOP_RIGHT_MID',
    label: 'Top Right Middle',
    x: 1130,
    y: 480,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_TOP_RIGHT_WING',
    label: 'Top Right Wing',
    x: 1390,
    y: 350,
    type: 'corridor',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Left lower wing
  // ─────────────────────────────────────────────
  {
    id: 'G_LEFT_MID',
    label: 'Left Middle Corridor',
    x: 170,
    y: 515,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_LEFT_BOTTOM',
    label: 'Left Bottom Corridor',
    x: 170,
    y: 635,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_LEFT_BOTTOM_ROW',
    label: 'Left Bottom Row',
    x: 420,
    y: 430,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_LEFT_TO_CENTER',
    label: 'Left To Center',
    x: 595,
    y: 500,
    type: 'corridor',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Right lower wing
  // ─────────────────────────────────────────────
  {
    id: 'G_RIGHT_TO_CENTER',
    label: 'Right To Center',
    x: 1085,
    y: 635,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_RIGHT_BOTTOM_ROW',
    label: 'Right Bottom Row',
    x: 1235,
    y: 635,
    type: 'corridor',
    isAccessible: true,
  },
  {
    id: 'G_RIGHT_MID',
    label: 'Right Middle Corridor',
    x: 1320,
    y: 500,
    type: 'corridor',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Top-left room doors
  // ─────────────────────────────────────────────
  {
    id: 'G0190_DOOR',
    label: 'G0190 Door',
    x: 250,
    y: 350,
    type: 'door',
    roomNumber: 'G0190',
    isAccessible: true,
  },
  {
    id: 'G0180_DOOR',
    label: 'G0180 Door',
    x: 370,
    y: 350,
    type: 'door',
    roomNumber: 'G0180',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Top middle room doors
  // ─────────────────────────────────────────────
  {
    id: 'G0150_DOOR',
    label: 'G0150 Door',
    x: 532,
    y: 278,
    type: 'door',
    roomNumber: 'G0150',
    isAccessible: true,
  },
  {
    id: 'G0140_DOOR',
    label: 'G0140 Door',
    x: 627,
    y: 278,
    type: 'door',
    roomNumber: 'G0140',
    isAccessible: true,
  },
  {
    id: 'G0130_DOOR',
    label: 'G0130 Door',
    x: 724,
    y: 278,
    type: 'door',
    roomNumber: 'G0130',
    isAccessible: true,
  },
  {
    id: 'G0131_DOOR',
    label: 'G0131 Door',
    x: 820,
    y: 278,
    type: 'door',
    roomNumber: 'G0131',
    isAccessible: true,
  },
  {
    id: 'G0120_DOOR',
    label: 'G0120 Door',
    x: 914,
    y: 278,
    type: 'door',
    roomNumber: 'G0120',
    isAccessible: true,
  },
  {
    id: 'G0110_DOOR',
    label: 'G0110 Door',
    x: 1013,
    y: 278,
    type: 'door',
    roomNumber: 'G0110',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Left wing room doors
  // ─────────────────────────────────────────────
  {
    id: 'G0220_DOOR',
    label: 'G0220 Door',
    x: 170,
    y: 520,
    type: 'door',
    roomNumber: 'G0220',
    isAccessible: true,
  },
  {
    id: 'G0230_DOOR',
    label: 'G0230 Door',
    x: 170,
    y: 625,
    type: 'door',
    roomNumber: 'G0230',
    isAccessible: true,
  },
  {
    id: 'G0240_DOOR',
    label: 'G0240 Door',
    x: 220,
    y: 635,
    type: 'door',
    roomNumber: 'G0240',
    isAccessible: true,
  },
  {
    id: 'G0250_DOOR',
    label: 'G0250 Door',
    x: 380,
    y: 635,
    type: 'door',
    roomNumber: 'G0250',
    isAccessible: true,
  },
  {
    id: 'G0260_DOOR',
    label: 'G0260 Door',
    x: 420,
    y: 640,
    type: 'door',
    roomNumber: 'G0260',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Center lower rooms
  // ─────────────────────────────────────────────
  {
    id: 'G0280_DOOR',
    label: 'G0280 Door',
    x: 670,
    y: 530,
    type: 'door',
    roomNumber: 'G0280',
    isAccessible: true,
  },
  {
    id: 'G0010_DOOR',
    label: 'G0010 Door',
    x: 922,
    y: 523,
    type: 'door',
    roomNumber: 'G0010',
    isAccessible: true,
  },
  {
    id: 'G0011_DOOR',
    label: 'G0011 Door',
    x: 1020,
    y: 523,
    type: 'door',
    roomNumber: 'G0011',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Right side room doors
  // ─────────────────────────────────────────────
  {
    id: 'G0080_DOOR',
    label: 'G0080 Door',
    x: 1225,
    y: 354,
    type: 'door',
    roomNumber: 'G0080',
    isAccessible: true,
  },
  {
    id: 'G0070_DOOR',
    label: 'G0070 Door',
    x: 1311,
    y: 354,
    type: 'door',
    roomNumber: 'G0070',
    isAccessible: true,
  },
  {
    id: 'G0030_DOOR',
    label: 'G0030 Door',
    x: 1110,
    y: 632,
    type: 'door',
    roomNumber: 'G0030',
    isAccessible: true,
  },
  {
    id: 'G0040_DOOR',
    label: 'G0040 Door',
    x: 1207,
    y: 632,
    type: 'door',
    roomNumber: 'G0040',
    isAccessible: true,
  },
  {
    id: 'G0050_DOOR',
    label: 'G0050 Door',
    x: 1302,
    y: 632,
    type: 'door',
    roomNumber: 'G0050',
    isAccessible: true,
  },
  {
    id: 'G0060_DOOR',
    label: 'G0060 Door',
    x: 1351,
    y: 500,
    type: 'door',
    roomNumber: 'G0060',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Elevators
  // ─────────────────────────────────────────────
  {
    id: 'G_ELEVATOR_LEFT_TOP_DOOR',
    label: 'Left Top Elevator',
    x: 471,
    y: 338,
    type: 'elevator',
    roomNumber: 'G-ELEVATOR-LEFT-TOP',
    isAccessible: true,
  },
  {
    id: 'G_ELEVATOR_CENTER_LEFT_DOOR',
    label: 'Center Left Elevator',
    x: 672,
    y: 417,
    type: 'elevator',
    roomNumber: 'G-ELEVATOR-CENTER-LEFT',
    isAccessible: true,
  },
  {
    id: 'G_ELEVATOR_CENTER_RIGHT_DOOR',
    label: 'Center Right Elevator',
    x: 913,
    y: 417,
    type: 'elevator',
    roomNumber: 'G-ELEVATOR-CENTER-RIGHT',
    isAccessible: true,
  },
  {
    id: 'G_ELEVATOR_RIGHT_TOP_DOOR',
    label: 'Right Top Elevator',
    x: 1112,
    y: 338,
    type: 'elevator',
    roomNumber: 'G-ELEVATOR-RIGHT-TOP',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Restrooms
  // ─────────────────────────────────────────────
  {
    id: 'G_W_RESTROOM_LEFT_DOOR',
    label: 'Women Restroom Left',
    x: 464,
    y: 306,
    type: 'restroom',
    roomNumber: 'G-W-RESTROOM-LEFT',
    isAccessible: true,
  },
  {
    id: 'G_M_RESTROOM_LEFT_DOOR',
    label: 'Men Restroom Left',
    x: 535,
    y: 354,
    type: 'restroom',
    roomNumber: 'G-M-RESTROOM-LEFT',
    isAccessible: true,
  },
  {
    id: 'G_M_RESTROOM_RIGHT_DOOR',
    label: 'Men Restroom Right',
    x: 1030,
    y: 354,
    type: 'restroom',
    roomNumber: 'G-M-RESTROOM-RIGHT',
    isAccessible: true,
  },
  {
    id: 'G_W_RESTROOM_RIGHT_DOOR',
    label: 'Women Restroom Right',
    x: 1086,
    y: 306,
    type: 'restroom',
    roomNumber: 'G-W-RESTROOM-RIGHT',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Accessible restrooms
  // ─────────────────────────────────────────────
  {
    id: 'G_DISABLED_LEFT_DOOR',
    label: 'Accessible Restroom Left',
    x: 134,
    y: 371,
    type: 'bathroom',
    roomNumber: 'G-DISABLED-RESTROOM-LEFT',
    isAccessible: true,
  },
  {
    id: 'G_DISABLED_RIGHT_DOOR',
    label: 'Accessible Restroom Right',
    x: 1565,
    y: 350,
    type: 'bathroom',
    roomNumber: 'G-DISABLED-RESTROOM-RIGHT',
    isAccessible: true,
  },

  // ─────────────────────────────────────────────
  // Stairs / emergency stairs
  // ─────────────────────────────────────────────
  {
    id: 'G_STAIRS_LEFT_DOOR',
    label: 'Emergency Stairs Left',
    x: 120,
    y: 270,
    type: 'emergency_stairs',
    roomNumber: 'G-STAIRS-LEFT',
    isAccessible: false,
  },
  {
    id: 'G_STAIRS_RIGHT_DOOR',
    label: 'Emergency Stairs Right',
    x: 1435,
    y: 275,
    type: 'emergency_stairs',
    roomNumber: 'G-STAIRS-RIGHT',
    isAccessible: false,
  },
  {
    id: 'G_INTERNAL_STAIRS_LEFT_DOOR',
    label: 'Internal Stairs Left',
    x: 498,
    y: 495,
    type: 'stairs',
    roomNumber: 'G-STAIRS-LEFT-INTERNAL',
    isAccessible: false,
  },
  {
    id: 'G_INTERNAL_STAIRS_RIGHT_DOOR',
    label: 'Internal Stairs Right',
    x: 1002,
    y: 425,
    type: 'stairs',
    roomNumber: 'G-STAIRS-RIGHT-INTERNAL',
    isAccessible: false,
  },

  // ─────────────────────────────────────────────
  // Entrances as clickable targets
  // ─────────────────────────────────────────────
  {
    id: 'G_NORTH_ENTRANCE_DOOR',
    label: 'North Entrance',
    x: 765,
    y: 710,
    type: 'entrance',
    roomNumber: 'G-NORTH-ENTRANCE',
    isAccessible: true,
  },
  {
    id: 'G_SOUTH_ENTRANCE_DOOR',
    label: 'South Entrance',
    x: 1230,
    y: 215,
    type: 'entrance',
    roomNumber: 'G-SOUTH-ENTRANCE',
    isAccessible: true,
  },
];

const G_NAV_EDGES = [
  // ─────────────────────────────────────────────
  // North entrance into central route
  // ─────────────────────────────────────────────
  ['G_NORTH_ENTRANCE_NODE', 'G_NORTH_LOBBY', 'walk'],
  ['G_NORTH_LOBBY', 'G_CENTER_CORE', 'walk'],

  // Central ring around the middle area
  ['G_CENTER_CORE', 'G_CENTER_LEFT_RING', 'walk'],
  ['G_CENTER_CORE', 'G_CENTER_RIGHT_RING', 'walk'],
  ['G_CENTER_LEFT_RING', 'G_LEFT_VERTICAL', 'walk'],
  ['G_CENTER_RIGHT_RING', 'G_RIGHT_VERTICAL', 'walk'],

  // Left and right vertical connections to top corridor
  ['G_LEFT_VERTICAL', 'G_TOP_LEFT_JUNCTION', 'walk'],
  ['G_RIGHT_VERTICAL', 'G_TOP_RIGHT_JUNCTION', 'walk'],

  // Top corridor left to right
  ['G_TOP_LEFT_WING', 'G_TOP_LEFT_MID', 'walk'],
  ['G_TOP_LEFT_MID', 'G_TOP_LEFT_JUNCTION', 'walk'],
  ['G_TOP_LEFT_JUNCTION', 'G_TOP_CENTER_LEFT', 'walk'],
  ['G_TOP_CENTER_LEFT', 'G_TOP_CENTER', 'walk'],
  ['G_TOP_CENTER', 'G_TOP_CENTER_RIGHT', 'walk'],
  ['G_TOP_CENTER_RIGHT', 'G_TOP_RIGHT_JUNCTION', 'walk'],
  ['G_TOP_RIGHT_JUNCTION', 'G_TOP_RIGHT_MID', 'walk'],
  ['G_TOP_RIGHT_MID', 'G_TOP_RIGHT_WING', 'walk'],

  // South entrance connection
  ['G_TOP_RIGHT_MID', 'G_SOUTH_ENTRANCE_CORRIDOR', 'walk'],
  ['G_SOUTH_ENTRANCE_CORRIDOR', 'G_SOUTH_ENTRANCE_NODE', 'walk'],

  // Left lower wing
  ['G_TOP_LEFT_WING', 'G_LEFT_MID', 'walk'],
  ['G_LEFT_MID', 'G_LEFT_BOTTOM', 'walk'],
  ['G_LEFT_BOTTOM', 'G_LEFT_BOTTOM_ROW', 'walk'],
  ['G_LEFT_BOTTOM_ROW', 'G_LEFT_TO_CENTER', 'walk'],
  ['G_LEFT_TO_CENTER', 'G_CENTER_LEFT_RING', 'walk'],

  // Right lower wing
  ['G_RIGHT_VERTICAL', 'G_RIGHT_TO_CENTER', 'walk'],
  ['G_RIGHT_TO_CENTER', 'G_RIGHT_BOTTOM_ROW', 'walk'],
  ['G_RIGHT_BOTTOM_ROW', 'G_RIGHT_MID', 'walk'],
  ['G_RIGHT_MID', 'G_TOP_RIGHT_MID', 'walk'],

  // Top-left room doors
  ['G0190_DOOR', 'G_TOP_LEFT_MID', 'walk'],
  ['G0180_DOOR', 'G_TOP_LEFT_MID', 'walk'],

  // Top middle room doors
  ['G0150_DOOR', 'G_TOP_CENTER_LEFT', 'walk'],
  ['G0140_DOOR', 'G_TOP_CENTER_LEFT', 'walk'],
  ['G0130_DOOR', 'G_TOP_CENTER', 'walk'],
  ['G0131_DOOR', 'G_TOP_CENTER', 'walk'],
  ['G0120_DOOR', 'G_TOP_CENTER_RIGHT', 'walk'],
  ['G0110_DOOR', 'G_TOP_CENTER_RIGHT', 'walk'],

  // Left wing room doors
  ['G0220_DOOR', 'G_LEFT_MID', 'walk'],
  ['G0230_DOOR', 'G_LEFT_BOTTOM', 'walk'],
  ['G0240_DOOR', 'G_LEFT_BOTTOM_ROW', 'walk'],
  ['G0250_DOOR', 'G_LEFT_BOTTOM_ROW', 'walk'],
  ['G0260_DOOR', 'G_LEFT_BOTTOM_ROW', 'walk'],

  // Center room doors
  ['G0280_DOOR', 'G_CENTER_LEFT_RING', 'walk'],
  ['G0010_DOOR', 'G_CENTER_RIGHT_RING', 'walk'],
  ['G0011_DOOR', 'G_CENTER_RIGHT_RING', 'walk'],

  // Right side room doors
  ['G0080_DOOR', 'G_TOP_RIGHT_MID', 'walk'],
  ['G0070_DOOR', 'G_TOP_RIGHT_MID', 'walk'],
  ['G0030_DOOR', 'G_RIGHT_TO_CENTER', 'walk'],
  ['G0040_DOOR', 'G_RIGHT_BOTTOM_ROW', 'walk'],
  ['G0050_DOOR', 'G_RIGHT_BOTTOM_ROW', 'walk'],
  ['G0060_DOOR', 'G_RIGHT_MID', 'walk'],

  // Elevators
  ['G_ELEVATOR_LEFT_TOP_DOOR', 'G_TOP_LEFT_JUNCTION', 'elevator'],
  ['G_ELEVATOR_CENTER_LEFT_DOOR', 'G_LEFT_VERTICAL', 'elevator'],
  ['G_ELEVATOR_CENTER_RIGHT_DOOR', 'G_RIGHT_VERTICAL', 'elevator'],
  ['G_ELEVATOR_RIGHT_TOP_DOOR', 'G_TOP_RIGHT_JUNCTION', 'elevator'],

  // Restrooms
  ['G_W_RESTROOM_LEFT_DOOR', 'G_TOP_LEFT_JUNCTION', 'walk'],
  ['G_M_RESTROOM_LEFT_DOOR', 'G_TOP_LEFT_JUNCTION', 'walk'],
  ['G_M_RESTROOM_RIGHT_DOOR', 'G_TOP_RIGHT_JUNCTION', 'walk'],
  ['G_W_RESTROOM_RIGHT_DOOR', 'G_TOP_RIGHT_JUNCTION', 'walk'],

  // Accessible restrooms
  ['G_DISABLED_LEFT_DOOR', 'G_TOP_LEFT_WING', 'walk'],
  ['G_DISABLED_RIGHT_DOOR', 'G_TOP_RIGHT_WING', 'walk'],

  // Stairs
  ['G_STAIRS_LEFT_DOOR', 'G_TOP_LEFT_WING', 'emergency'],
  ['G_STAIRS_RIGHT_DOOR', 'G_TOP_RIGHT_WING', 'emergency'],
  ['G_INTERNAL_STAIRS_LEFT_DOOR', 'G_LEFT_VERTICAL', 'stairs'],
  ['G_INTERNAL_STAIRS_RIGHT_DOOR', 'G_RIGHT_VERTICAL', 'stairs'],

  // Entrances as target blocks
  ['G_NORTH_ENTRANCE_DOOR', 'G_NORTH_ENTRANCE_NODE', 'walk'],
  ['G_SOUTH_ENTRANCE_DOOR', 'G_SOUTH_ENTRANCE_NODE', 'walk'],
];

export const G_START_NODES = [
  {
    value: 'G_NORTH_ENTRANCE_NODE',
    label: 'North Entrance — المدخل الشمالي',
  },
  {
    value: 'G_SOUTH_ENTRANCE_NODE',
    label: 'South Entrance — المدخل الجنوبي',
  },
  {
    value: 'G_CENTER_CORE',
    label: 'Main Hall — الساحة الوسطى',
  },
  {
    value: 'G_TOP_LEFT_JUNCTION',
    label: 'Left Corridor — الممر الأيسر',
  },
  {
    value: 'G_TOP_RIGHT_JUNCTION',
    label: 'Right Corridor — الممر الأيمن',
  },
];

function distance(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  return Math.sqrt(dx * dx + dy * dy);
}

function getNodeMap() {
  return new Map(G_NAV_NODES.map(node => [node.id, node]));
}

function getRoomNodeId(roomNumber) {
  const node = G_NAV_NODES.find(item => item.roomNumber === roomNumber);
  return node?.id || null;
}

function getEdgeCost(edgeType, fromNode, toNode, options = {}) {
  let cost = distance(fromNode, toNode);

  if (edgeType === 'stairs') cost += 25;
  if (edgeType === 'elevator') cost += 8;
  if (edgeType === 'emergency') cost += options.emergencyMode ? 0 : 90;

  if (options.accessibleOnly) {
    if (edgeType === 'stairs' || edgeType === 'emergency') {
      return Infinity;
    }

    if (toNode.isAccessible === false || fromNode.isAccessible === false) {
      return Infinity;
    }
  }

  return cost;
}

function buildGraph(options = {}) {
  const nodeMap = getNodeMap();
  const graph = new Map();

  G_NAV_NODES.forEach(node => {
    graph.set(node.id, []);
  });

  G_NAV_EDGES.forEach(([fromId, toId, edgeType = 'walk']) => {
    const fromNode = nodeMap.get(fromId);
    const toNode = nodeMap.get(toId);

    if (!fromNode || !toNode) return;

    const forwardCost = getEdgeCost(edgeType, fromNode, toNode, options);
    const backwardCost = getEdgeCost(edgeType, toNode, fromNode, options);

    if (Number.isFinite(forwardCost)) {
      graph.get(fromId).push({
        to: toId,
        cost: forwardCost,
        edgeType,
      });
    }

    if (Number.isFinite(backwardCost)) {
      graph.get(toId).push({
        to: fromId,
        cost: backwardCost,
        edgeType,
      });
    }
  });

  return graph;
}

function reconstructPath(cameFrom, currentId, nodeMap) {
  const path = [nodeMap.get(currentId)];

  while (cameFrom.has(currentId)) {
    currentId = cameFrom.get(currentId);
    path.unshift(nodeMap.get(currentId));
  }

  return path;
}

export function findGroundFloorRoute({
  fromNodeId = 'G_NORTH_ENTRANCE_NODE',
  toRoomNumber,
  accessibleOnly = false,
  emergencyMode = false,
}) {
  const nodeMap = getNodeMap();
  const toNodeId = getRoomNodeId(toRoomNumber);

  if (!toNodeId) {
    return {
      success: false,
      message: `No navigation node found for ${toRoomNumber}`,
      path: [],
      instructions: [],
    };
  }

  if (!nodeMap.has(fromNodeId)) {
    return {
      success: false,
      message: `Invalid start node: ${fromNodeId}`,
      path: [],
      instructions: [],
    };
  }

  const graph = buildGraph({ accessibleOnly, emergencyMode });

  const startNode = nodeMap.get(fromNodeId);
  const targetNode = nodeMap.get(toNodeId);

  const openSet = new Set([fromNodeId]);
  const cameFrom = new Map();

  const gScore = new Map();
  const fScore = new Map();

  G_NAV_NODES.forEach(node => {
    gScore.set(node.id, Infinity);
    fScore.set(node.id, Infinity);
  });

  gScore.set(fromNodeId, 0);
  fScore.set(fromNodeId, distance(startNode, targetNode));

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

    if (currentId === toNodeId) {
      const path = reconstructPath(cameFrom, currentId, nodeMap);

      return {
        success: true,
        path: path.map(node => ({
          id: node.id,
          label: node.label,
          x: node.x,
          y: node.y,
          type: node.type,
          roomNumber: node.roomNumber || null,
        })),
        instructions: buildRouteInstructions(path),
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
    message: `No route found to ${toRoomNumber}`,
    path: [],
    instructions: [],
  };
}

function buildRouteInstructions(path) {
  if (!path || path.length < 2) return [];

  const first = path[0];
  const last = path[path.length - 1];

  const instructions = [
    `Start from ${first.label}.`,
    'Follow the highlighted route through the corridor.',
  ];

  const hasElevator = path.some(node => node.type === 'elevator');
  const hasStairs = path.some(
    node => node.type === 'stairs' || node.type === 'emergency_stairs'
  );

  if (hasElevator) {
    instructions.push('Use the elevator area if needed.');
  }

  if (hasStairs) {
    instructions.push('Pass by the stairs area carefully.');
  }

  instructions.push(`Arrive at ${last.roomNumber || last.label}.`);

  return instructions;
}