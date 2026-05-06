// ─── Room type definitions — An-Najah Faculty of Engineering ──
export const ROOM_TYPES = [
  { value: 'lecture_hall',     label: 'Lecture Hall',     color: 'classroom'    },
  { value: 'lab',              label: 'Lab',               color: 'lab'          },
  { value: 'office',           label: 'Office',            color: 'office'       },
  { value: 'bathroom',         label: 'Bathroom',          color: 'restroom'     },
  { value: 'amphitheater',     label: 'Amphitheater',      color: 'amphitheater' },
  { value: 'professor_lounge', label: 'Professor Lounge',  color: 'lounge'       },
  { value: 'storage',          label: 'Storage Room',      color: 'storage'      },
  { value: 'stairs',           label: 'Stairs',            color: 'stairs'       },
  { value: 'elevator',         label: 'Elevator',          color: 'elevator'     },
];

export const ROOM_TYPE_LABELS = Object.fromEntries(
  ROOM_TYPES.map(t => [t.value, t.label])
);

export function getRoomTypeLabel(type) {
  return ROOM_TYPE_LABELS[type] || (type ? type.replace(/_/g, ' ') : 'Unknown');
}

export function getRoomTypeColor(type) {
  const colors = {
    lecture_hall:     { fill:'#f0dbd0', stroke:'#b88870', text:'#5a3020' },
    lab:              { fill:'#cce8d0', stroke:'#48985a', text:'#1a4a28' },
    office:           { fill:'#fff3cd', stroke:'#d4a017', text:'#7a5000' },
    bathroom:         { fill:'#b4ceea', stroke:'#3a78b0', text:'#1a3858' },
    amphitheater:     { fill:'#f5e88a', stroke:'#c8a010', text:'#5a4000' },
    professor_lounge: { fill:'#e8d8f0', stroke:'#8860b0', text:'#4a2070' },
    storage:          { fill:'#ddd8d0', stroke:'#908878', text:'#484038' },
    stairs:           { fill:'#b4ceea', stroke:'#3a78b0', text:'#1a3858' },
    elevator:         { fill:'#b4ceea', stroke:'#3a78b0', text:'#1a3858' },
  };
  return colors[type] || { fill:'#ece8e4', stroke:'#9a9490', text:'#444' };
}
