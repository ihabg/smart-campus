import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMySchedule } from '../hooks/index';
import { Spinner } from '../components/ui/index';
import './SchedulePage.css';

const DAYS = [
  { id: 0, en: 'Sunday', ar: 'احد' },
  { id: 1, en: 'Monday', ar: 'اثنين' },
  { id: 2, en: 'Tuesday', ar: 'ثلاث' },
  { id: 3, en: 'Wednesday', ar: 'اربعاء' },
  { id: 4, en: 'Thursday', ar: 'خميس' },
  { id: 5, en: 'Friday', ar: 'جمعة' },
  { id: 6, en: 'Saturday', ar: 'سبت' }
];

const TIME_SLOTS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00'
];

export default function SchedulePage() {
  const [view, setView] = useState('table');
  const [semester, setSemester] = useState('spring');
  const [year, setYear] = useState('2025/2026');

  const { schedule, loading, error } = useMySchedule({
    semester,
    academic_year: year
  });

  const sections = schedule?.sections || [];
  const byDay = schedule?.by_day || {};

  const totalCredits = useMemo(() => {
    return sections.reduce((sum, sec) => sum + Number(sec.credit_hours || 0), 0);
  }, [sections]);

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
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="2025/2026">2025/2026</option>
            <option value="2024/2025">2024/2025</option>
            <option value="2023/2024">2023/2024</option>
          </select>

          <select value={semester} onChange={(e) => setSemester(e.target.value)}>
            <option value="fall">First Semester</option>
            <option value="spring">Second Semester</option>
            <option value="summer">Summer Semester</option>
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
        <TextSchedule sections={sections} totalCredits={totalCredits} />
      )}
    </div>
  );
}

function TableSchedule({ byDay }) {
  return (
    <div className="sc-table-wrapper">
      <table className="sc-grid-table">
        <thead>
          <tr>
            <th className="sc-day-time">
              <div>Day</div>
              <div>Time</div>
            </th>

            {TIME_SLOTS.map((time) => (
              <th key={time}>{formatHour(time)}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {DAYS.map((day) => (
            <tr key={day.id}>
              <th className="sc-day-name">{day.en}</th>

              {TIME_SLOTS.map((time) => {
                const meetings = getMeetingsForSlot(byDay[day.id] || [], time);

                return (
                  <td key={`${day.id}-${time}`} className="sc-slot">
                    {meetings.map((meeting) => (
                      <CourseBlock
                        key={`${meeting.section_id}-${meeting.meeting_id || time}`}
                        meeting={meeting}
                      />
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CourseBlock({ meeting }) {
  return (
    <Link
      to="/map"
      state={{ roomId: meeting.room_id }}
      className={`sc-course ${getCourseColor(meeting.course_code)}`}
    >
      <strong>{meeting.course_code}</strong>
      <span>{meeting.course_name_ar || meeting.course_name}</span>
      <small>
        {cleanTime(meeting.start_time)} - {cleanTime(meeting.end_time)}
      </small>
      <em>Room {meeting.room_number || '—'}</em>
    </Link>
  );
}

function TextSchedule({ sections, totalCredits }) {
  const rows = [];

  sections.forEach((section) => {
    const meetings = section.meetings || [];

    if (meetings.length === 0) {
      rows.push({ ...section, rowSpan: 1 });
      return;
    }

    meetings.forEach((meeting, index) => {
      rows.push({
        ...section,
        ...meeting,
        rowSpan: index === 0 ? meetings.length : 0
      });
    });
  });

  return (
    <div className="sc-text-wrapper">
      <table className="sc-text-table">
        <thead>
          <tr>
            <th>Course No.</th>
            <th>Section</th>
            <th>Course Name</th>
            <th>Credits</th>
            <th>Day</th>
            <th>Time</th>
            <th>Room</th>
            <th>Instructor</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.section_id}-${row.meeting_id || index}`}>
              {row.rowSpan !== 0 && (
                <>
                  <td rowSpan={row.rowSpan}>{row.course_code}</td>
                  <td rowSpan={row.rowSpan}>{row.section_number}</td>
                  <td rowSpan={row.rowSpan}>{row.course_name_ar || row.course_name}</td>
                  <td rowSpan={row.rowSpan}>{row.credit_hours || 3}</td>
                </>
              )}

              <td>{getDayName(row.day_of_week)}</td>
              <td>
                {row.start_time && row.end_time
                  ? `${cleanTime(row.start_time)} - ${cleanTime(row.end_time)}`
                  : '—'}
              </td>
              <td>Room {row.room_number || '—'}</td>

              {row.rowSpan !== 0 && (
                <td rowSpan={row.rowSpan}>{row.instructor_name || '—'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sc-total">Total registered hours = {totalCredits}</div>
    </div>
  );
}

function getMeetingsForSlot(dayMeetings, slot) {
  return dayMeetings.filter((meeting) => {
    const start = cleanTime(meeting.start_time);
    const end = cleanTime(meeting.end_time);
    const current = cleanTime(slot);

    return start <= current && end > current;
  });
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

function getCourseColor(code) {
  const colors = {
    '10636314': 'yellow',
    '10636332': 'pink',
    '10636451': 'cyan',
    '10636581': 'purple',
    '11032102': 'blue'
  };

  return colors[code] || 'gray';
}