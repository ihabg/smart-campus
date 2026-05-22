import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { scheduleAPI } from '../api/index';
import { Spinner } from '../components/ui/index';
import './StudentMaterialsPage.css';

const MATERIAL_TYPES = {
  lecture_notes: 'Lecture notes',
  slides: 'Slides',
  assignment: 'Assignment',
  lab_sheet: 'Lab sheet',
  recording: 'Recording',
  reference: 'Reference',
  exam_review: 'Exam review'
};

export default function StudentMaterialsPage() {
  const [semester, setSemester] = useState('spring');
  const [year, setYear] = useState('2025/2026');
  const [activeSection, setActiveSection] = useState('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ sections: [], materials: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    async function loadMaterials() {
      setLoading(true);
      setError('');

      try {
        const response = await scheduleAPI.getMaterials({
          semester,
          academic_year: year,
          // Always load all enrolled courses for the selected semester/year.
          // Course selection is handled locally so the user can always return to the original full list.
        });

        if (!alive) return;

        setData({
          sections: response.data?.data?.sections || [],
          materials: response.data?.data?.materials || []
        });
      } catch (err) {
        if (!alive) return;
        setError(err?.response?.data?.message || 'Could not load course materials.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadMaterials();
    return () => { alive = false; };
  }, [semester, year]);

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();

    return data.materials.filter((material) => {
      if (activeSection !== 'all' && String(material.section_id) !== String(activeSection)) {
        return false;
      }

      if (!q) return true;

      const text = [
        material.title,
        material.description,
        material.course_code,
        material.course_name,
        material.course_name_ar,
        material.instructor_name,
        material.material_type,
        material.week_number
      ].filter(Boolean).join(' ').toLowerCase();

      return text.includes(q);
    });
  }, [data.materials, search, activeSection]);

  const groupedMaterials = useMemo(() => {
    const groups = new Map();

    filteredMaterials.forEach((material) => {
      const key = material.section_id;
      if (!groups.has(key)) {
        groups.set(key, {
          section_id: material.section_id,
          course_code: material.course_code,
          course_name: material.course_name,
          course_name_ar: material.course_name_ar,
          section_number: material.section_number,
          instructor_name: material.instructor_name,
          instructor_email: material.instructor_email,
          materials: []
        });
      }

      groups.get(key).materials.push(material);
    });

    return Array.from(groups.values());
  }, [filteredMaterials]);

  const selectedSection = useMemo(() => {
    if (activeSection === 'all') return null;
    return data.sections.find((section) => String(section.section_id) === String(activeSection)) || null;
  }, [data.sections, activeSection]);

  const hasActiveFilters = activeSection !== 'all' || Boolean(search.trim());

  function resetToOriginalView() {
    setActiveSection('all');
    setSearch('');
  }

  async function openMaterial(material) {
    try {
      const response = await scheduleAPI.openMaterial(material.id);
      const url = response.data?.data?.file_url || material.file_url;
      if (!url) return;
      window.open(toPublicFileUrl(url), '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not open this material.');
    }
  }

  return (
    <div className="student-materials-page">
      <section className="sm-hero">
        <div>
          <span className="sm-kicker">Course Materials</span>
          <h1>Materials from your enrolled courses</h1>
          <p>Lecture notes, slides, assignments, lab sheets, references, and exam reviews uploaded by your professors.</p>
        </div>

        <div className="sm-hero__stats">
          <div><strong>{data.sections.length}</strong><span>courses</span></div>
          <div><strong>{data.materials.length}</strong><span>materials</span></div>
        </div>
      </section>

      <section className="sm-toolbar card">
        <div className="sm-field">
          <span>Academic year</span>
          <select value={year} onChange={(e) => { setYear(e.target.value); resetToOriginalView(); }}>
            <option value="2025/2026">2025/2026</option>
            <option value="2024/2025">2024/2025</option>
            <option value="2023/2024">2023/2024</option>
          </select>
        </div>

        <div className="sm-field">
          <span>Semester</span>
          <select value={semester} onChange={(e) => { setSemester(e.target.value); resetToOriginalView(); }}>
            <option value="fall">First Semester</option>
            <option value="spring">Second Semester</option>
            <option value="summer">Summer Semester</option>
          </select>
        </div>

        <div className="sm-field sm-field--wide">
          <span>Course</span>
          <select value={activeSection} onChange={(e) => setActiveSection(e.target.value)}>
            <option value="all">All enrolled courses</option>
            {data.sections.map((section) => (
              <option key={section.section_id} value={section.section_id}>
                {section.course_code} §{section.section_number} — {section.course_name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm-field sm-field--search">
          <span>Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search material, week, course, professor..."
          />
        </div>

        <button
          type="button"
          className="sm-reset-btn"
          disabled={!hasActiveFilters}
          onClick={resetToOriginalView}
        >
          Back to all courses
        </button>
      </section>

      {error && <div className="sm-alert">{error}</div>}

      {loading ? (
        <Spinner center />
      ) : data.sections.length === 0 ? (
        <div className="card sm-empty">
          <div>📭</div>
          <strong>No enrolled courses found</strong>
          <p>You do not have enrolled courses for the selected semester and academic year.</p>
        </div>
      ) : (
        <div className="sm-grid">
          <aside className="card sm-course-list">
            <h3>My courses</h3>

            <button className={activeSection === 'all' ? 'active' : ''} onClick={resetToOriginalView}>
              <strong>All</strong>
              <span>All enrolled courses</span>
              <small>{data.materials.length} total materials</small>
            </button>

            {data.sections.map((section) => (
              <button
                key={section.section_id}
                className={String(activeSection) === String(section.section_id) ? 'active' : ''}
                onClick={() => setActiveSection(section.section_id)}
              >
                <strong>{section.course_code}</strong>
                <span>{section.course_name}</span>
                <small>{section.materials_count || 0} materials · {section.instructor_name || '—'}</small>
              </button>
            ))}
          </aside>

          <main className="sm-material-groups">
            {selectedSection && (
              <div className="card sm-selected-course">
                <div>
                  <span>Selected course</span>
                  <strong>{selectedSection.course_code} §{selectedSection.section_number} — {selectedSection.course_name}</strong>
                </div>
                <button type="button" onClick={resetToOriginalView}>Back to all courses</button>
              </div>
            )}

            {groupedMaterials.length === 0 ? (
              <div className="card sm-empty">
                <div>📭</div>
                <strong>No materials found</strong>
                <p>Your professors have not published materials for the selected filters yet.</p>
                {hasActiveFilters && (
                  <button type="button" className="sm-empty__button" onClick={resetToOriginalView}>
                    Back to original list
                  </button>
                )}
              </div>
            ) : (
              groupedMaterials.map((group) => (
                <section key={group.section_id} className="card sm-group">
                  <div className="sm-group__head">
                    <div>
                      <h2>{group.course_code} — {group.course_name}</h2>
                      <p>Section {group.section_number} · {group.instructor_name || 'Professor'}</p>
                    </div>
                    <Link to="/schedule" className="btn btn--sm btn--secondary">Open schedule</Link>
                  </div>

                  <div className="sm-material-list">
                    {group.materials.map((material) => (
                      <article key={material.id} className={`sm-material ${material.opened_by_me ? 'sm-material--opened' : ''}`}>
                        <div className="sm-material__icon">{iconForMaterial(material.material_type)}</div>

                        <div className="sm-material__body">
                          <div className="sm-material__meta">
                            <span>{MATERIAL_TYPES[material.material_type] || material.material_type}</span>
                            {material.week_number && <span>Week {material.week_number}</span>}
                            {material.opened_by_me && <span className="sm-seen">Opened</span>}
                          </div>

                          <h3>{material.title}</h3>
                          {material.description && <p>{material.description}</p>}

                          <div className="sm-material__details">
                            <span>{formatDate(material.uploaded_at)}</span>
                            {material.room_number && <span>{displayRoom(material.room_number)}</span>}
                            <span>{Number(material.download_count || 0)} opens</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="sm-open-btn"
                          disabled={!material.file_url}
                          onClick={() => openMaterial(material)}
                        >
                          {material.file_url ? 'Open' : 'No file'}
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ))
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function toPublicFileUrl(fileUrl) {
  if (!fileUrl) return '';
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;

  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
  const publicBase = apiBase.replace(/\/api\/?$/, '');
  return `${publicBase}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
}

function iconForMaterial(type) {
  if (type === 'slides') return '📊';
  if (type === 'assignment') return '📝';
  if (type === 'lab_sheet') return '🧪';
  if (type === 'recording') return '🎥';
  if (type === 'reference') return '📚';
  if (type === 'exam_review') return '✅';
  return '📄';
}

function formatDate(value) {
  if (!value) return 'No date';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function isOnlineRoom(roomNumber) {
  const value = String(roomNumber || '').trim();
  return value === '9999' || value.endsWith('9999');
}

function displayRoom(roomNumber) {
  return isOnlineRoom(roomNumber) ? 'Online' : `Room ${roomNumber}`;
}
