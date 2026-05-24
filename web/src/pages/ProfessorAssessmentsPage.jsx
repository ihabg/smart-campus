import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { assessmentAPI } from '../api/index';
import { Spinner } from '../components/ui/index';
import useProfessorTerm from '../hooks/useProfessorTerm';
import './ProfessorAssessmentsPage.css';

const TYPES = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'quiz', label: 'Quiz' }
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function toInputDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultForm(sectionId = '') {
  const opens = new Date();
  opens.setMinutes(opens.getMinutes() + 10);
  const closes = new Date(opens);
  closes.setDate(closes.getDate() + 7);

  return {
    section_id: sectionId,
    assessment_type: 'assignment',
    title: '',
    description: '',
    week_number: '',
    opens_at: toInputDateTime(opens),
    closes_at: toInputDateTime(closes),
    duration_minutes: 30,
    points: 100,
    allow_late: false,
    is_published: true
  };
}

function defaultQuestion(position = 1) {
  return {
    question_text: '',
    question_type: 'single_choice',
    points: 1,
    options: [
      { option_text: '', is_correct: true },
      { option_text: '', is_correct: false },
      { option_text: '', is_correct: false },
      { option_text: '', is_correct: false }
    ],
    position
  };
}

function statusOf(item) {
  const now = Date.now();
  const open = new Date(item.opens_at).getTime();
  const close = new Date(item.closes_at).getTime();
  if (!item.is_published) return 'Draft';
  if (now < open) return 'Scheduled';
  if (now > close) return 'Closed';
  return 'Open now';
}

function dateTimeLabel(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function publicFileUrl(fileUrl) {
  if (!fileUrl) return '';
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
  const publicBase = apiBase.replace(/\/api\/?$/, '');
  return `${publicBase}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
}

export default function ProfessorAssessmentsPage() {
  const { semester, academicYear, termLoading, hasTerm } = useProfessorTerm();

  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [assessments, setAssessments] = useState([]);
  const [form, setForm] = useState(defaultForm(''));
  const [questions, setQuestions] = useState([defaultQuestion(1)]);
  const [assignmentFile, setAssignmentFile] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedSectionInfo = useMemo(
    () => sections.find((section) => section.id === selectedSection),
    [sections, selectedSection]
  );

  const loadSections = useCallback(async () => {
    if (!hasTerm) {
      setLoading(false);
      return;
    }
    // Clear stale data before fetching for the new term
    setSections([]);
    setAssessments([]);
    setSelectedSection('');
    const response = await assessmentAPI.professorSections({
      semester,
      academic_year: academicYear
    });
    const rows = response.data?.data || [];
    setSections(rows);
    if (rows.length) {
      setSelectedSection(rows[0].id);
      setForm(defaultForm(rows[0].id));
    }
  }, [semester, academicYear, hasTerm]);

  const loadAssessments = useCallback(async (sectionId = selectedSection) => {
    if (!sectionId) return;
    const response = await assessmentAPI.professorList({ section_id: sectionId });
    setAssessments(response.data?.data || []);
  }, [selectedSection]);

  useEffect(() => {
    let alive = true;
    async function start() {
      setLoading(true);
      setError('');
      try {
        await loadSections();
      } catch (err) {
        if (alive) setError(err?.response?.data?.message || 'Could not load professor sections.');
      } finally {
        if (alive) setLoading(false);
      }
    }
    start();
    return () => { alive = false; };
  }, [loadSections]);

  useEffect(() => {
    if (!selectedSection) return;
    setForm((current) => ({ ...current, section_id: selectedSection }));
    loadAssessments(selectedSection).catch((err) => {
      setError(err?.response?.data?.message || 'Could not load assessments.');
    });
  }, [selectedSection, loadAssessments]);

  function changeForm(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateQuestion(index, key, value) {
    setQuestions((current) => current.map((question, i) => (
      i === index ? { ...question, [key]: value } : question
    )));
  }

  function updateOption(questionIndex, optionIndex, key, value) {
    setQuestions((current) => current.map((question, i) => {
      if (i !== questionIndex) return question;
      const nextOptions = question.options.map((option, j) => {
        if (j !== optionIndex) {
          if (key === 'is_correct' && value && question.question_type === 'single_choice') {
            return { ...option, is_correct: false };
          }
          return option;
        }
        return { ...option, [key]: value };
      });
      return { ...question, options: nextOptions };
    }));
  }

  function addQuestion() {
    setQuestions((current) => [...current, defaultQuestion(current.length + 1)]);
  }

  function removeQuestion(index) {
    setQuestions((current) => current.filter((_, i) => i !== index));
  }

  async function submitAssessment(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        ...form,
        points: Number(form.points || 100),
        week_number: form.week_number ? Number(form.week_number) : null,
        duration_minutes: form.assessment_type === 'quiz' ? Number(form.duration_minutes || 30) : null,
        questions: form.assessment_type === 'quiz' ? questions : undefined
      };

      await assessmentAPI.professorCreate(payload, form.assessment_type === 'assignment' ? assignmentFile : null);
      setMessage(`${form.assessment_type === 'quiz' ? 'Quiz' : 'Assignment'} created successfully.`);
      setForm(defaultForm(selectedSection));
      setQuestions([defaultQuestion(1)]);
      setAssignmentFile(null);
      await loadAssessments(selectedSection);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save assessment.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAssessment(item) {
    const ok = window.confirm(`Delete "${item.title}"? This also deletes submissions/attempts.`);
    if (!ok) return;

    try {
      await assessmentAPI.professorDelete(item.id);
      setMessage('Assessment deleted.');
      if (results?.assessment?.id === item.id) setResults(null);
      await loadAssessments(selectedSection);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not delete assessment.');
    }
  }

  async function openResults(item) {
    setError('');
    try {
      const response = await assessmentAPI.professorResults(item.id);
      setResults(response.data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load results.');
    }
  }

  async function gradeSubmission(row, grade, feedback) {
    if (!row.submission_id) return;
    try {
      await assessmentAPI.gradeSubmission(results.assessment.id, row.submission_id, { grade, feedback });
      await openResults(results.assessment);
      setMessage('Grade saved.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save grade.');
    }
  }

  if (loading || (termLoading && !hasTerm)) return <Spinner center />;

  if (!hasTerm) {
    return (
      <div className="assess-page">
        <section className="assess-hero">
          <div>
            <span>Professor Portal</span>
            <h1>Assignments &amp; Quizzes</h1>
          </div>
        </section>
        <div className="empty-state" style={{ marginTop: 32 }}>
          <div className="empty-state__icon">📋</div>
          <p className="empty-state__title">No assigned sections yet.</p>
          <p>You will see your assessments once sections are assigned to you for the current semester.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="assess-page">
      <section className="assess-hero">
        <div>
          <span>Professor Portal</span>
          <h1>Assignments & Quizzes</h1>
          <p>Create timed assignments and quizzes for your sections. Students see only published items from their enrolled courses.</p>
        </div>
        <div className="assess-hero__stats">
          <strong>{sections.length}</strong><span>sections</span>
          <strong>{assessments.length}</strong><span>items</span>
        </div>
      </section>

      {error && <div className="assess-alert assess-alert--error">{error}</div>}
      {message && <div className="assess-alert assess-alert--ok">{message}</div>}

      <div className="assess-layout">
        <form className="assess-card assess-form" onSubmit={submitAssessment}>
          <div className="assess-card__head">
            <h2>Create assessment</h2>
            <small>Scheduled by open/close time</small>
          </div>

          <label>
            Section
            <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.code} — {section.course_name} §{section.section_number}
                </option>
              ))}
            </select>
          </label>

          {selectedSectionInfo && (
            <div className="assess-section-box">
              <strong>{selectedSectionInfo.code}</strong>
              <span>{selectedSectionInfo.course_name}</span>
              <small>§{selectedSectionInfo.section_number} · {selectedSectionInfo.enrolled || 0} students</small>
            </div>
          )}

          <div className="assess-row">
            <label>
              Type
              <select value={form.assessment_type} onChange={(e) => changeForm('assessment_type', e.target.value)}>
                {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label>
              Week
              <input type="number" min="1" max="16" value={form.week_number} onChange={(e) => changeForm('week_number', e.target.value)} placeholder="1-16" />
            </label>
          </div>

          <label>
            Title
            <input value={form.title} onChange={(e) => changeForm('title', e.target.value)} placeholder="Example: Dynamic Programming Assignment" required />
          </label>

          <label>
            Description / instructions
            <textarea value={form.description} onChange={(e) => changeForm('description', e.target.value)} placeholder="Explain what students should do..." rows="4" />
          </label>

          {form.assessment_type === 'assignment' && (
            <label>
              Assignment file / instructions
              <div className="prof-upload-box">
                <input
                  type="file"
                  onChange={(e) => setAssignmentFile(e.target.files?.[0] || null)}
                />
                <span>{assignmentFile ? assignmentFile.name : 'Optional: PDF, Word, slides, image, ZIP...'}</span>
              </div>
            </label>
          )}

          <div className="assess-row">
            <label>
              Opens at
              <input type="datetime-local" value={form.opens_at} onChange={(e) => changeForm('opens_at', e.target.value)} required />
            </label>
            <label>
              Closes / due at
              <input type="datetime-local" value={form.closes_at} onChange={(e) => changeForm('closes_at', e.target.value)} required />
            </label>
          </div>

          <div className="assess-row">
            <label>
              Points
              <input type="number" min="1" step="0.5" value={form.points} onChange={(e) => changeForm('points', e.target.value)} />
            </label>
            {form.assessment_type === 'quiz' && (
              <label>
                Quiz duration, minutes
                <input type="number" min="1" value={form.duration_minutes} onChange={(e) => changeForm('duration_minutes', e.target.value)} />
              </label>
            )}
          </div>

          <div className="assess-checks">
            <label><input type="checkbox" checked={form.is_published} onChange={(e) => changeForm('is_published', e.target.checked)} /> Published</label>
            {form.assessment_type === 'assignment' && (
              <label><input type="checkbox" checked={form.allow_late} onChange={(e) => changeForm('allow_late', e.target.checked)} /> Allow late submissions</label>
            )}
          </div>

          {form.assessment_type === 'quiz' && (
            <div className="quiz-builder">
              <div className="assess-card__head">
                <h3>Quiz questions</h3>
                <button type="button" className="assess-btn assess-btn--secondary" onClick={addQuestion}>Add question</button>
              </div>

              {questions.map((question, qIndex) => (
                <div key={qIndex} className="question-box">
                  <div className="assess-row">
                    <label>
                      Question type
                      <select
                        value={question.question_type}
                        onChange={(e) => updateQuestion(qIndex, 'question_type', e.target.value)}
                      >
                        <option value="single_choice">Single choice</option>
                        <option value="multiple_choice">Multiple choice</option>
                        <option value="text">Text answer</option>
                      </select>
                    </label>
                    <label>
                      Points
                      <input type="number" min="0.5" step="0.5" value={question.points} onChange={(e) => updateQuestion(qIndex, 'points', e.target.value)} />
                    </label>
                  </div>

                  <label>
                    Question {qIndex + 1}
                    <textarea value={question.question_text} onChange={(e) => updateQuestion(qIndex, 'question_text', e.target.value)} required rows="2" />
                  </label>

                  {question.question_type !== 'text' && (
                    <div className="options-box">
                      {question.options.map((option, optionIndex) => (
                        <div key={optionIndex} className="option-line">
                          <input
                            value={option.option_text}
                            onChange={(e) => updateOption(qIndex, optionIndex, 'option_text', e.target.value)}
                            placeholder={`Option ${optionIndex + 1}`}
                          />
                          <label>
                            <input
                              type={question.question_type === 'single_choice' ? 'radio' : 'checkbox'}
                              name={`correct-${qIndex}`}
                              checked={option.is_correct}
                              onChange={(e) => updateOption(qIndex, optionIndex, 'is_correct', e.target.checked)}
                            />
                            Correct
                          </label>
                        </div>
                      ))}
                    </div>
                  )}

                  {questions.length > 1 && (
                    <button type="button" className="assess-btn assess-btn--danger" onClick={() => removeQuestion(qIndex)}>Remove question</button>
                  )}
                </div>
              ))}
            </div>
          )}

          <button className="assess-btn assess-btn--primary" type="submit" disabled={saving || !selectedSection}>
            {saving ? 'Saving...' : `Create ${form.assessment_type}`}
          </button>
        </form>

        <section className="assess-card assess-list">
          <div className="assess-card__head">
            <h2>Assessments list</h2>
            <button className="assess-btn assess-btn--secondary" onClick={() => loadAssessments(selectedSection)}>Refresh</button>
          </div>

          {assessments.length === 0 ? (
            <div className="assess-empty">No assignments or quizzes for this section yet.</div>
          ) : assessments.map((item) => (
            <article key={item.id} className="assess-item">
              <div>
                <div className="assess-badges">
                  <span>{item.assessment_type}</span>
                  {item.week_number && <span>Week {item.week_number}</span>}
                  <span>{statusOf(item)}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description || 'No instructions.'}</p>
                <small>
                  Opens {dateTimeLabel(item.opens_at)} · Closes {dateTimeLabel(item.closes_at)} · {item.points} pts
                  {item.assessment_type === 'quiz' ? ` · ${item.duration_minutes} minutes` : ''}
                </small>
                {item.attachment_url && (
                  <div className="assess-attachment-line">
                    <a href={publicFileUrl(item.attachment_url)} target="_blank" rel="noreferrer">
                      Open assignment file{item.attachment_name ? `: ${item.attachment_name}` : ''}
                    </a>
                  </div>
                )}
              </div>
              <div className="assess-item__actions">
                <button className="assess-btn assess-btn--secondary" onClick={() => openResults(item)}>Results</button>
                <button className="assess-btn assess-btn--danger" onClick={() => deleteAssessment(item)}>Delete</button>
              </div>
            </article>
          ))}
        </section>
      </div>

      {results && (
        <section className="assess-card results-card">
          <div className="assess-card__head">
            <h2>Results — {results.assessment.title}</h2>
            <button className="assess-btn assess-btn--secondary" onClick={() => setResults(null)}>Close</button>
          </div>

          <div className="results-table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Score / Grade</th>
                  <th>File / Feedback</th>
                </tr>
              </thead>
              <tbody>
                {results.rows.map((row) => (
                  <ResultRow key={row.student_id} row={row} assessment={results.assessment} onGrade={gradeSubmission} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ResultRow({ row, assessment, onGrade }) {
  const [grade, setGrade] = useState(row.grade || '');
  const [feedback, setFeedback] = useState(row.feedback || '');

  return (
    <tr>
      <td>{row.student_name}<br /><small>{row.email}</small></td>
      <td>{row.university_id || '—'}</td>
      <td>{row.status || row.attempt_status || 'Not submitted'}</td>
      <td>{dateTimeLabel(row.submitted_at || row.quiz_submitted_at)}</td>
      <td>
        {assessment.assessment_type === 'quiz' ? (
          row.score ?? '—'
        ) : row.submission_id ? (
          <div className="grade-box">
            <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder={`0-${assessment.points}`} />
            <button className="assess-btn assess-btn--primary" onClick={() => onGrade(row, grade, feedback)}>Save</button>
          </div>
        ) : '—'}
      </td>
      <td>
        {row.file_url && <a href={publicFileUrl(row.file_url)} target="_blank" rel="noreferrer">Open file</a>}
        {assessment.assessment_type === 'assignment' && row.submission_id && (
          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback" rows="2" />
        )}
      </td>
    </tr>
  );
}
