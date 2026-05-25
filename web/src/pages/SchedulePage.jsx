import React, { useMemo, useState, useEffect } from 'react';
import axios from 'axios';

import { useMySchedule } from '../hooks/index';
import { scheduleAPI } from '../api/index';
import { Spinner } from '../components/ui/index';
import './SchedulePage.css';
import { Link } from 'react-router-dom';
const DAYS = [
  { id: 0, en: 'Sunday', ar: 'احد' },
  { id: 1, en: 'Monday', ar: 'اثنين' },
  { id: 2, en: 'Tuesday', ar: 'ثلاث' },
  { id: 3, en: 'Wednesday', ar: 'اربعاء' },
  { id: 4, en: 'Thursday', ar: 'خميس' },
  { id: 5, en: 'Friday', ar: 'جمعة' },
  { id: 6, en: 'Saturday', ar: 'سبت' }
];

// Half-hour slots used by buildDayCells to place and span meetings precisely
const TIME_SLOTS = [
  '07:00', '07:30',
  '08:00', '08:30',
  '09:00', '09:30',
  '10:00', '10:30',
  '11:00', '11:30',
  '12:00', '12:30',
  '13:00', '13:30',
  '14:00', '14:30',
  '15:00', '15:30',
  '16:00', '16:30',
  '17:00', '17:30',
  '18:00', '18:30',
  '19:00', '19:30',
  '20:00', '20:30',
  '21:00', '21:30',
  '22:00', '22:30',
  '23:00', '23:30',
];

// Whole-hour labels for the thead — each header cell spans 2 half-hour columns
const HOUR_SLOTS = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
  '21:00', '22:00', '23:00',
];

export default function SchedulePage() {
  const [view, setView] = useState('table');
  const [officeHoursModal, setOfficeHoursModal] = useState(false);
  const [officeHours, setOfficeHours] = useState([]);
  const [selectedInstructor, setSelectedInstructor] = useState(null);

  const [terms, setTerms] = useState([]);
  const [termsLoading, setTermsLoading] = useState(true);
  const [selectedTermIdx, setSelectedTermIdx] = useState(0);

  useEffect(() => {
    setTermsLoading(true);
    scheduleAPI.getMyTerms()
      .then(res => {
        const t = res.data?.data?.terms || [];
        setTerms(t);
        setSelectedTermIdx(0);
      })
      .catch(() => setTerms([]))
      .finally(() => setTermsLoading(false));
  }, []);

  const selectedTerm = terms[selectedTermIdx] || null;
  const semester = selectedTerm?.semester || '';
  const year = selectedTerm?.academic_year || '';

  const scheduleParams = selectedTerm
    ? { semester: selectedTerm.semester, academic_year: selectedTerm.academic_year }
    : null;

  const { schedule, loading, error } = useMySchedule(scheduleParams);
const openOfficeHours = async (instructor) => {
  if (!instructor?.email) return;
  if (!selectedTerm) return;

  try {
    const token =
      localStorage.getItem('token') ||
      localStorage.getItem('accessToken') ||
      localStorage.getItem('authToken');

    const response = await axios.get(
      `http://localhost:5000/api/office-hours/${encodeURIComponent(instructor.email)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          semester: selectedTerm.semester,
          academic_year: selectedTerm.academic_year
        }
      }
    );

    setSelectedInstructor(instructor);
    setOfficeHours(response.data.data);
    setOfficeHoursModal(true);
  } catch (error) {
    console.error('Professor schedule error:', error);
    setSelectedInstructor(instructor);
    setOfficeHours({
      instructor,
      schedule: [],
      office_hours: []
    });
    setOfficeHoursModal(true);
  }
};
  const sections = schedule?.sections || [];
  const byDay = schedule?.by_day || {};

  const totalCredits = useMemo(() => {
    return sections.reduce((sum, sec) => sum + Number(sec.credit_hours || 0), 0);
  }, [sections]);

  if (termsLoading) return <Spinner center />;

  if (!termsLoading && terms.length === 0) {
    return (
      <div className="sc-page">
        <div className="sc-empty">No active schedule is available yet.</div>
      </div>
    );
  }

  if (loading) return <Spinner center />;

  if (error) {
    return (
      <div className="sc-page">
        <div className="sc-empty">{error}</div>
      </div>
    );
  }

  return (
    <div className="sc-page">
      <div className="sc-header">
        <div>
          <h1>My Schedule</h1>
          <p>{sections.length} sections enrolled</p>
        </div>

        <div className="sc-controls">
          <select
            value={selectedTermIdx}
            onChange={(e) => setSelectedTermIdx(Number(e.target.value))}
          >
            {terms.map((t, i) => (
              <option key={`${t.semester}-${t.academic_year}`} value={i}>
                {t.label || `${semesterName(t.semester)} ${t.academic_year}`}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={view === 'table' ? 'active' : ''}
            onClick={() => setView('table')}
          >
            Table View
          </button>

          <button
            type="button"
            className={view === 'text' ? 'active' : ''}
            onClick={() => setView('text')}
          >
            Text View
          </button>
        </div>
      </div>

      <div className="sc-semester-title">
        {semesterName(semester)} {year}
      </div>

      {sections.length === 0 ? (
        <div className="sc-empty">No registered courses for this semester.</div>
      ) : view === 'table' ? (
        <TableSchedule byDay={byDay} />
      ) : (
        <TextSchedule
  sections={sections}
  totalCredits={totalCredits}
  openOfficeHours={openOfficeHours}
/>
      )}
      {officeHoursModal && (
  <OfficeHoursModal
    instructor={selectedInstructor}
    officeHours={officeHours}
    onClose={() => setOfficeHoursModal(false)}
    selectedTerm={selectedTerm}
  />
)}
    </div>
  );
}

function TableSchedule({ byDay }) {
  return (
    <div className="sc-table-wrapper">
      <table className="sc-grid-table">
        {/* colgroup pins each half-hour sub-column to 26 px; table-layout:fixed uses these */}
        <colgroup>
          <col style={{ width: 70 }} />
          {HOUR_SLOTS.map(t => (
            <React.Fragment key={t}>
              <col style={{ width: 26 }} />
              <col style={{ width: 26 }} />
            </React.Fragment>
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="sc-day-time">
              <div>Day</div>
              <div>Time</div>
            </th>

            {/* Each hour label spans 2 half-hour sub-columns */}
            {HOUR_SLOTS.map((time) => (
              <th key={time} colSpan={2}>{formatHour(time)}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {DAYS.map((day) => {
            const meetings = byDay[day.id] || [];
            const cells = buildDayCells(meetings);

            return (
              <tr key={day.id}>
                <th className="sc-day-name">{day.en}</th>

                {cells.map((cell) => {
                  if (cell.type === 'empty') {
                    return (
                      <td
                        key={`${day.id}-${cell.time}`}
                        className={`sc-slot${cell.time.endsWith(':30') ? ' sc-slot--half' : ' sc-slot--hour-start'}`}
                      />
                    );
                  }

                  return (
                    <td
                      key={`${day.id}-${cell.meeting.meeting_id}`}
                      className="sc-slot"
                      colSpan={cell.colSpan}
                    >
                      <CourseBlock meeting={cell.meeting} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function buildDayCells(dayMeetings) {
  const cells = [];
  const sortedMeetings = [...dayMeetings].sort((a, b) =>
    cleanTime(a.start_time).localeCompare(cleanTime(b.start_time))
  );

  let i = 0;

  while (i < TIME_SLOTS.length) {
    const slot = TIME_SLOTS[i];

    const meeting = sortedMeetings.find(
      (m) => cleanTime(m.start_time) === slot
    );

    if (!meeting) {
      cells.push({
        type: 'empty',
        time: slot
      });

      i += 1;
      continue;
    }

    const duration = getSlotSpan(meeting.start_time, meeting.end_time);

    cells.push({
      type: 'meeting',
      meeting,
      colSpan: duration
    });

    i += duration;
  }

  return cells;
}
function getSlotSpan(startTime, endTime) {
  const start = toMinutes(startTime);
  const end   = toMinutes(endTime);
  // Return number of 30-minute half-hour slots the meeting occupies.
  // Math.round avoids floating-point drift; min 1 slot so nothing collapses.
  const durationMinutes = Math.max(end - start, 30);
  return Math.round(durationMinutes / 30);
}

function toMinutes(time) {
  const [hours, minutes] = cleanTime(time).split(':').map(Number);
  return hours * 60 + minutes;
}
function getScheduleRoomNumber(item) {
  const value =
    item?.room_number ||
    item?.roomNumber ||
    item?.room ||
    item?.room_code ||
    item?.roomCode ||
    item?.room_name ||
    item?.roomName ||
    '';

  return String(value)
    .replace(/^Room\s*/i, '')
    .trim();
}

function isOnlineRoom(roomNumber) {
  const value = String(roomNumber || '').trim();
  return value === '9999' || value.endsWith('9999');
}

function displayRoom(roomNumber, fallback = '—') {
  if (isOnlineRoom(roomNumber)) return 'الكتروني';
  return roomNumber || fallback;
}

function hasActiveScheduleChange(item) {
  return Boolean(item?.schedule_change_id);
}

function changeLabel(item) {
  if (!hasActiveScheduleChange(item)) return '';
  if (item.change_scope === 'single_day') return 'تغيير لهذا اليوم';
  if (item.change_scope === 'date_range') return 'تغيير مؤقت';
  return 'تغيير دائم';
}

function CourseBlock({ meeting }) {
  const rawRoomNumber = getScheduleRoomNumber(meeting);
  const targetRoomNumber = normalizeScheduleRoomNumber(rawRoomNumber);
  const mapUrl = targetRoomNumber && !isOnlineRoom(targetRoomNumber)
    ? `/map?room=${encodeURIComponent(targetRoomNumber)}`
    : null;

  const content = (
    <>
      <strong>{meeting.course_code}</strong>
      <span>{meeting.course_name_ar || meeting.course_name}</span>
      <small>
        {cleanTime(meeting.start_time)} - {cleanTime(meeting.end_time)}
      </small>
      <em>{displayRoom(meeting.room_number)}</em>
      {hasActiveScheduleChange(meeting) && (
        <small className="sc-change-note">{changeLabel(meeting)}</small>
      )}
    </>
  );

  if (!mapUrl) {
    return (
      <div className={`sc-course ${getCourseColor(meeting.course_code)} sc-course-disabled`}>
        {content}
      </div>
    );
  }

  return (
    <Link
      to={mapUrl}
      state={{
        roomId: meeting.room_id,
        roomNumber: rawRoomNumber,
        targetRoomNumber,
        fromSchedule: true
      }}
      className={`sc-course ${getCourseColor(meeting.course_code)} sc-course-clickable`}
      title={`Open room ${targetRoomNumber} on map`}
    >
      {content}
    </Link>
  );
}
function getMapRoomUrl(item) {
  const rawRoomNumber = getScheduleRoomNumber(item);
  const targetRoomNumber = normalizeScheduleRoomNumber(rawRoomNumber);

  if (!targetRoomNumber || isOnlineRoom(targetRoomNumber)) return null;

  return `/map?room=${encodeURIComponent(targetRoomNumber)}&source=schedule`;
}
function normalizeScheduleRoomNumber(roomNumber) {
  const raw = String(roomNumber || '').trim();

  if (!raw || raw === '—') return '';

  if (/^\d{6}$/.test(raw)) {
    return raw.slice(2);
  }

  return raw;
}
function TextSchedule({ sections, totalCredits, openOfficeHours }) {
  const rows = [];

  sections.forEach((section) => {
    const meetings = section.meetings || [];

    meetings.forEach((meeting, index) => {
      rows.push({
        ...section,
        ...meeting,
        rowSpan: index === 0 ? meetings.length : 0
      });
    });
  });

  return (
    <div className="sc-text-wrapper" dir="rtl">
      <div className="sc-note">
        ملاحظة: اضغط على اسم المدرس للاطلاع على الساعات المكتبية
      </div>

      <table className="sc-text-table">
        <thead>
          <tr>
            <th>رقم المساق حسب الخطة</th>
            <th>رقم المساق/ش</th>
            <th>اسم المساق</th>
            <th>س.م</th>
            <th></th>
            <th>الأيام</th>
            <th>من-إلى</th>
            <th>رقم القاعة</th>
            <th>الحرم</th>
            <th>اسم المدرس</th>
            <th>المجموع الكلي لساعات الغياب</th>
            <th>ساعات غياب بعذر</th>
            <th>حرمان</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.section_id}-${row.meeting_id || index}`}>
              {row.rowSpan !== 0 && (
                <>
                  <td rowSpan={row.rowSpan}>{row.course_code}</td>

                  <td rowSpan={row.rowSpan}>
                    {row.course_code}/{row.section_number}
                  </td>

                  <td rowSpan={row.rowSpan}>
                    {row.course_name_ar || row.course_name}
                  </td>

                  <td rowSpan={row.rowSpan}>{row.credit_hours || 3}</td>

                  <td rowSpan={row.rowSpan}></td>
                </>
              )}

              <td>{arabicDayName(row.day_of_week)}</td>

              <td>
                {cleanTime(row.start_time)} - {cleanTime(row.end_time)}
              </td>

              <td>
  {getMapRoomUrl(row) ? (
    <Link className="sc-room-link" to={getMapRoomUrl(row)}>
      {displayRoom(row.room_number)}
    </Link>
  ) : (
    displayRoom(row.room_number)
  )}
  {hasActiveScheduleChange(row) && (
    <div className="sc-change-chip">{changeLabel(row)}</div>
  )}
</td>

              <td>
                {isOnlineRoom(row.room_number) || row.meeting_type === 'electronic' || row.note ? (
                  <span className="online-text">{row.note || 'الكتروني'}</span>
                ) : (
                  'الجديد'
                )}
              </td>

              {row.rowSpan !== 0 && (
                <>
                  <td rowSpan={row.rowSpan}>
                    <button
                      type="button"
                      className="doctor-link"
                      onClick={() =>
                        openOfficeHours({
                          name: row.instructor_name,
                          email: row.instructor_email,
                          department: row.department
                        })
                      }
                    >
                      {row.instructor_name || '—'}
                    </button>
                  </td>

                  <td rowSpan={row.rowSpan}>{row.absence_total ?? 0}</td>

                  <td rowSpan={row.rowSpan}>
                    {row.excused_absence_total ?? 0}
                  </td>

                  <td rowSpan={row.rowSpan}>
                    {row.deprivation_status || 'لا'}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sc-total">
        مجموع الساعات المسجلة = {totalCredits}
      </div>
    </div>
  );
}

function OfficeHoursModal({ instructor, officeHours, onClose, selectedTerm }) {
  const schedule = officeHours?.schedule || [];
  const office = officeHours?.office_hours || [];
  const info = officeHours?.instructor || instructor;

  const doctorName =
    info?.first_name && info?.last_name
      ? `${info.title || 'د.'} ${info.first_name} ${info.last_name}`
      : info?.name || instructor?.name || '—';

  const termLabel = selectedTerm
    ? `${semesterNameAr(selectedTerm.semester)} ${selectedTerm.academic_year}`
    : '';

  const hasContent = schedule.length > 0 || office.length > 0;

  return (
    <div className="office-hours-modal" onClick={onClose}>
      <div
        className="office-hours-card professor-schedule-card"
        dir="rtl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="office-hours-header">
          <div>
            <h2>الساعات المكتبية{termLabel ? ` - ${termLabel}` : ''}</h2>
            <p>الاسم: {doctorName}</p>
            <small>{info?.email || instructor?.email || ''}</small>
          </div>

          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="professor-note">
          -- ملاحظة: المربع الواحد يمثل نصف ساعة زمنية<br />
          -- إشارة (++++) تعني تضارب في المواعيد في حال ظهورها
        </div>

        {hasContent ? (
          <ProfessorScheduleGrid schedule={schedule} officeHours={office} />
        ) : (
          <div className="prof-empty-state">
            لا يوجد جدول لهذا الدكتور في الفصل المحدد
            {termLabel ? ` (${termLabel})` : ''}
          </div>
        )}

        <button type="button" className="office-hours-close" onClick={onClose}>
          إغلاق
        </button>
      </div>
    </div>
  );
}

function ProfessorScheduleGrid({ schedule, officeHours }) {
  const items = [
    ...schedule.map((item) => ({
      ...item,
      type: 'course'
    })),
    ...officeHours.map((item) => ({
      ...item,
      type: 'office',
      course_name_ar: 'O.H.',
      course_code: '',
      section_number: '',
      room_number: item.office_room || ''
    }))
  ];

  return (
    <div className="prof-grid-wrapper">
      <table className="prof-grid-table">
        <colgroup>
          <col style={{ width: 70 }} />
          {PROF_HOUR_SLOTS.map(t => (
            <React.Fragment key={t}>
              <col style={{ width: 29 }} />
              <col style={{ width: 29 }} />
            </React.Fragment>
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="prof-day-time">اليوم/<br />الوقت</th>
            {PROF_HOUR_SLOTS.map((time) => (
              <th key={time} colSpan={2}>{formatHour(time)}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {DAYS.map((day) => {
            const cells = buildProfessorDayCells(
              items.filter((x) => Number(x.day_of_week) === day.id)
            );

            return (
              <tr key={day.id}>
                <th className="prof-day-name">{day.ar}</th>

                {cells.map((cell, index) => {
                  if (cell.type === 'empty') {
                    return (
                      <td
                        key={`${day.id}-${cell.time}-${index}`}
                        className={`prof-slot${cell.time.endsWith(':30') ? ' prof-slot--half' : ' prof-slot--hour-start'}`}
                      />
                    );
                  }

                  return (
                    <td
                      key={`${day.id}-${cell.item.type}-${index}`}
                      className="prof-slot"
                      colSpan={cell.colSpan}
                    >
                      <div className={`prof-block ${cell.item.type}`}>
                        {cell.item.type === 'office' ? (
                          <strong>O.H.</strong>
                        ) : (
                          <>
                            <span>
                              {cell.item.course_name_ar ||
                                cell.item.course_name}
                            </span>
                            <strong>
                              {cell.item.course_code}
                              {cell.item.section_number
                                ? `/${cell.item.section_number}`
                                : ''}
                            </strong>
                            <em>{cell.item.room_number || '—'}</em>
                            {cell.item.note && (
                              <small>{cell.item.note}</small>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
const PROF_TIME_SLOTS = [
  '08:00', '08:30',
  '09:00', '09:30',
  '10:00', '10:30',
  '11:00', '11:30',
  '12:00', '12:30',
  '13:00', '13:30',
  '14:00', '14:30',
  '15:00', '15:30',
  '16:00', '16:30',
  '17:00', '17:30',
  '18:00', '18:30',
  '19:00', '19:30',
  '20:00', '20:30',
  '21:00', '21:30',
  '22:00', '22:30',
  '23:00', '23:30',
];

const PROF_HOUR_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
  '22:00', '23:00',
];

function buildProfessorDayCells(dayItems) {
  const cells = [];
  const sorted = [...dayItems].sort((a, b) =>
    cleanTime(a.start_time).localeCompare(cleanTime(b.start_time))
  );

  let i = 0;

  while (i < PROF_TIME_SLOTS.length) {
    const slot = PROF_TIME_SLOTS[i];

    const item = sorted.find(
      (x) => cleanTime(x.start_time) === slot
    );

    if (!item) {
      cells.push({
        type: 'empty',
        time: slot
      });

      i += 1;
      continue;
    }

    const span = getSlotSpan(item.start_time, item.end_time);

    cells.push({
      type: 'item',
      item,
      colSpan: span
    });

    i += span;
  }

  return cells;
}

function getMeetingsForSlot(dayMeetings, slot) {
  return dayMeetings.filter((meeting) => {
    const start = cleanTime(meeting.start_time);
    const end = cleanTime(meeting.end_time);
    const current = cleanTime(slot);

    return start <= current && end > current;
  });
}
function arabicDayName(day) {
  const names = {
    0: 'احد',
    1: 'اثنين',
    2: 'ثلاث',
    3: 'اربعاء',
    4: 'خميس',
    5: 'جمعة',
    6: 'سبت'
  };

  return names[Number(day)] || '—';
}

function cleanTime(time) {
  return String(time || '').slice(0, 5);
}

function formatHour(time) {
  const hour = Number(time.slice(0, 2));
  if (hour === 0) return '12';
  if (hour <= 12) return String(hour);
  return String(hour - 12);
}

function getDayName(day) {
  const found = DAYS.find((d) => d.id === Number(day));
  return found ? found.en : '—';
}

function semesterName(semester) {
  if (semester === 'fall') return 'First Semester';
  if (semester === 'spring') return 'Second Semester';
  if (semester === 'summer') return 'Summer Semester';
  return semester;
}

function semesterNameAr(semester) {
  if (semester === 'fall')   return 'أول';
  if (semester === 'spring') return 'ثاني';
  if (semester === 'summer') return 'صيفي';
  return semester;
}

function getCourseColor(code) {
  const colors = {
    // Spring
    '10636314': 'yellow',
    '10636332': 'pink',
    '10636451': 'cyan',
    '10636581': 'purple',
    '11032102': 'blue',

    // Fall
    '10606102': 'yellow',
    '10636410': 'pink',
    '10636423': 'cyan',
    '10636455': 'purple',
    '10636493': 'blue',
    '10636496': 'pink',
    '10636568': 'cyan'
  };

  return colors[code] || 'gray';
}