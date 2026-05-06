// ═══════════════════════════════════════════════════════════
// MOCK ROOM DATA — Smart Campus / An-Najah Faculty of Engineering
// Backend-ready structure: switch to API call by replacing
// `getRoomLiveData` with axios.get('/api/rooms/:id/live')
// ═══════════════════════════════════════════════════════════

export const ROOMS_DB = {
  // ── Ground Floor ──────────────────────────────────────
  'G0110': { number:'G0110', name:'Classroom G0110', type:'lecture_hall', floor:'Ground Floor', capacity:35, building:'Faculty of Engineering' },
  'G0120': { number:'G0120', name:'Classroom G0120', type:'lecture_hall', floor:'Ground Floor', capacity:30, building:'Faculty of Engineering' },
  'G0130': { number:'G0130', name:'Classroom G0130', type:'lecture_hall', floor:'Ground Floor', capacity:60, building:'Faculty of Engineering' },
  'G0140': { number:'G0140', name:'Classroom G0140', type:'lecture_hall', floor:'Ground Floor', capacity:30, building:'Faculty of Engineering' },
  'G0150': { number:'G0150', name:'Classroom G0150', type:'lecture_hall', floor:'Ground Floor', capacity:30, building:'Faculty of Engineering' },
  'G0180': { number:'G0180', name:'Office G0180',    type:'office',       floor:'Ground Floor', capacity:8,  building:'Faculty of Engineering' },
  'G0190': { number:'G0190', name:'Office G0190',    type:'office',       floor:'Ground Floor', capacity:8,  building:'Faculty of Engineering' },
  'G0070': { number:'G0070', name:'Office G0070',    type:'office',       floor:'Ground Floor', capacity:12, building:'Faculty of Engineering' },
  'G0220': { number:'G0220', name:'Hall G0220',      type:'lecture_hall', floor:'Ground Floor', capacity:120,building:'Faculty of Engineering' },
  'G0280': { number:'G0280', name:'Room G0280',      type:'lecture_hall', floor:'Ground Floor', capacity:35, building:'Faculty of Engineering' },
  'G0010': { number:'G0010', name:'Room G0010',      type:'lecture_hall', floor:'Ground Floor', capacity:30, building:'Faculty of Engineering' },
  'G0011': { number:'G0011', name:'Room G0011',      type:'lecture_hall', floor:'Ground Floor', capacity:30, building:'Faculty of Engineering' },
  'G0230': { number:'G0230', name:'Classroom G0230', type:'lecture_hall', floor:'Ground Floor', capacity:35, building:'Faculty of Engineering' },
  'G0240': { number:'G0240', name:'Classroom G0240', type:'lecture_hall', floor:'Ground Floor', capacity:35, building:'Faculty of Engineering' },
  'G0250': { number:'G0250', name:'Classroom G0250', type:'lecture_hall', floor:'Ground Floor', capacity:35, building:'Faculty of Engineering' },
  'G0260': { number:'G0260', name:'Classroom G0260', type:'lecture_hall', floor:'Ground Floor', capacity:35, building:'Faculty of Engineering' },
  'G0040': { number:'G0040', name:'Room G0040',      type:'lecture_hall', floor:'Ground Floor', capacity:25, building:'Faculty of Engineering' },
  'G0050': { number:'G0050', name:'Room G0050',      type:'lecture_hall', floor:'Ground Floor', capacity:25, building:'Faculty of Engineering' },
  'G0060': { number:'G0060', name:'Engineering Amphitheater', type:'amphitheater', floor:'Ground Floor', capacity:300, building:'Faculty of Engineering' },

  // ── Third Floor ───────────────────────────────────────
  '3010': { number:'3010', name:'Lab 3010',          type:'lab',           floor:'Third Floor',  capacity:25, building:'Faculty of Engineering' },
  '3020': { number:'3020', name:'Room 3020',         type:'lecture_hall',  floor:'Third Floor',  capacity:20, building:'Faculty of Engineering' },
  '3021': { number:'3021', name:'Room 3021',         type:'lecture_hall',  floor:'Third Floor',  capacity:20, building:'Faculty of Engineering' },
  '3030': { number:'3030', name:'Lab 3030',          type:'lab',           floor:'Third Floor',  capacity:25, building:'Faculty of Engineering' },
  '3032': { number:'3032', name:'Lab 3032',          type:'lab',           floor:'Third Floor',  capacity:25, building:'Faculty of Engineering' },
  '3060': { number:'3060', name:'Lab 3060',          type:'lab',           floor:'Third Floor',  capacity:25, building:'Faculty of Engineering' },
  '3070': { number:'3070', name:'Lab 3070',          type:'lab',           floor:'Third Floor',  capacity:25, building:'Faculty of Engineering' },
  '3080': { number:'3080', name:'Room 3080',         type:'lecture_hall',  floor:'Third Floor',  capacity:35, building:'Faculty of Engineering' },
  '3100': { number:'3100', name:'Room 3100',         type:'lecture_hall',  floor:'Third Floor',  capacity:30, building:'Faculty of Engineering' },
  '3110': { number:'3110', name:'Room 3110',         type:'lecture_hall',  floor:'Third Floor',  capacity:30, building:'Faculty of Engineering' },
  '3130': { number:'3130', name:'Lab 3130',          type:'lab',           floor:'Third Floor',  capacity:25, building:'Faculty of Engineering' },
  '3140': { number:'3140', name:'Lab 3140',          type:'lab',           floor:'Third Floor',  capacity:25, building:'Faculty of Engineering' },
  '3150': { number:'3150', name:'Lab 3150',          type:'lab',           floor:'Third Floor',  capacity:25, building:'Faculty of Engineering' },

  // ── Fourth Floor ──────────────────────────────────────
  '4030': { number:'4030', name:'Lecture Hall 4030', type:'lecture_hall',  floor:'Fourth Floor', capacity:35, building:'Faculty of Engineering' },
  '4040': { number:'4040', name:'Lecture Hall 4040', type:'lecture_hall',  floor:'Fourth Floor', capacity:35, building:'Faculty of Engineering' },
  '4050': { number:'4050', name:'Lecture Hall 4050', type:'lecture_hall',  floor:'Fourth Floor', capacity:35, building:'Faculty of Engineering' },
  '4060': { number:'4060', name:'Lab 4060',          type:'lab',           floor:'Fourth Floor', capacity:25, building:'Faculty of Engineering' },
  '4070': { number:'4070', name:'Lecture Hall 4070', type:'lecture_hall',  floor:'Fourth Floor', capacity:40, building:'Faculty of Engineering' },
  '4080': { number:'4080', name:'Lecture Hall 4080', type:'lecture_hall',  floor:'Fourth Floor', capacity:40, building:'Faculty of Engineering' },
  'SSDC': { number:'SSDC',  name:'Steel Structure Design Center', type:'lab', floor:'Fourth Floor', capacity:30, building:'Faculty of Engineering' },
};

const SCHEDULE = {
  'G0130': [
    { days:[0,2,4], startTime:'09:00', endTime:'10:30', course:'Computer Networks',     instructor:'Dr. Ahmad Saleh',    status:'occupied' },
    { days:[1,3],   startTime:'11:00', endTime:'12:30', course:'Data Structures',       instructor:'Dr. Lina Hassan',    status:'occupied' },
  ],
  'G0220': [
    { days:[0,1,2,3,4], startTime:'08:00', endTime:'10:00', course:'Software Engineering', instructor:'Dr. Lina Hassan', status:'occupied' },
  ],
  'G0060': [
    { days:[0,2],   startTime:'10:00', endTime:'12:00', course:'Engineering Mathematics',instructor:'Dr. Mohammed Ali',  status:'occupied' },
    { days:[1,3,4], startTime:'13:00', endTime:'15:00', course:'Linear Algebra',         instructor:'Dr. Saed Musmar',   status:'occupied' },
  ],
  'G0010': [
    { days:[0,2,4], startTime:'14:00', endTime:'15:30', course:'Database Systems',       instructor:'Dr. Feras Tamimi',  status:'reserved' },
  ],
  'G0140': [
    { days:[1,3],   startTime:'09:00', endTime:'10:30', course:'Algorithms',             instructor:'Dr. Samer Zein',    status:'occupied' },
  ],
  '3010': [
    { days:[0,2,4], startTime:'10:00', endTime:'12:00', course:'Computer Networks Lab',  instructor:'Dr. Rana Khatib',   status:'occupied' },
  ],
  '3030': [
    { days:[1,3],   startTime:'09:00', endTime:'11:00', course:'Microprocessors Lab',    instructor:'Dr. Nidal Jaber',   status:'occupied' },
  ],
  '3130': [
    { days:[0,2],   startTime:'13:00', endTime:'15:00', course:'Digital Logic Design',   instructor:'Dr. Wael Farhan',   status:'occupied' },
  ],
  '4030': [
    { days:[0,2,4], startTime:'08:00', endTime:'09:30', course:'Structural Analysis',    instructor:'Dr. Samer Nabulsi', status:'occupied' },
  ],
  '4060': [
    { days:[1,3],   startTime:'10:00', endTime:'12:00', course:'Materials Lab',          instructor:'Dr. Ibrahim Surakji',status:'occupied' },
  ],
  'SSDC': [
    { days:[0,2,4], startTime:'11:00', endTime:'13:00', course:'Steel Design Project',   instructor:'Dr. Khalid Mansour',status:'occupied' },
  ],
};

function timeToMinutes(t) {
  const [h,m] = t.split(':').map(Number);
  return h*60 + m;
}

export function getRoomLiveData(roomId) {
  const room = ROOMS_DB[roomId];
  if (!room) return null;

  const now    = new Date();
  const day    = now.getDay();
  const minNow = now.getHours()*60 + now.getMinutes();
  const sched  = SCHEDULE[roomId] || [];

  let current = null;
  let next    = null;

  for (const s of sched) {
    if (!s.days.includes(day)) continue;
    const start = timeToMinutes(s.startTime);
    const end   = timeToMinutes(s.endTime);

    if (minNow >= start && minNow < end) {
      current = s;
      break;
    }
    if (minNow < start && (!next || timeToMinutes(s.startTime) < timeToMinutes(next.startTime))) {
      next = s;
    }
  }

  let status = 'available';
  if (current) status = current.status === 'reserved' ? 'reserved' : 'occupied';

  return {
    ...room,
    status,
    current,
    next,
    todaySchedule: sched.filter(s => s.days.includes(day)),
  };
}

export function getAllRoomsStatus() {
  const result = {};
  Object.keys(ROOMS_DB).forEach(id => {
    const data = getRoomLiveData(id);
    result[id] = data?.status || 'available';
  });
  return result;
}
