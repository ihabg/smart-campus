import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { assessmentAPI } from '../api/index';
import { Spinner } from '../components/ui/index';
import './StudentAssessmentsPage.css';

function dateTimeLabel(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function statusOf(item) {
  const now = Date.now();
  const open = new Date(item.opens_at).getTime();
  const close = new Date(item.closes_at).getTime();

  if (item.assessment_type === 'assignment' && item.submission_id) return 'Submitted';
  if (item.assessment_type === 'quiz' && item.attempt_status === 'submitted') return 'Submitted';
  if (now < open) return 'Scheduled';
  if (now > close) return 'Closed';
  return 'Open now';
}

function publicFileUrl(fileUrl) {
  if (!fileUrl) return '';
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
  const publicBase = apiBase.replace(/\/api\/?$/, '');
  return `${publicBase}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
}

function secondsLeft(value) {
  if (!value) return 0;
  return Math.max(0, Math.floor((new Date(value).getTime() - Date.now()) / 1000));
}

function formatSeconds(total) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function StudentAssessmentsPage() {
  const location = useLocation();
  const autoOpenedAssessmentRef = useRef('');
  const [semester, setSemester] = useState('spring');
  const [academicYear, setAcademicYear] = useState('2025/2026');
  const [sectionId, setSectionId] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [data, setData] = useState({ sections: [], assessments: [] });
  const [selected, setSelected] = useState(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submissionFile, setSubmissionFile] = useState(null);
  const [answers, setAnswers] = useState({});
  const [quizReview, setQuizReview] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await assessmentAPI.studentList({
        semester,
        academic_year: academicYear,
        section_id: sectionId === 'all' ? undefined : sectionId
      });
      setData(response.data?.data || { sections: [], assessments: [] });
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load assignments and quizzes.');
    } finally {
      setLoading(false);
    }
  }, [semester, academicYear, sectionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const targetAssessmentId = location.state?.assessmentId || params.get('assessment_id');

    if (!targetAssessmentId || loading || autoOpenedAssessmentRef.current === String(targetAssessmentId)) return;

    const target = data.assessments.find((item) => String(item.id) === String(targetAssessmentId));
    if (target) {
      autoOpenedAssessmentRef.current = String(targetAssessmentId);
      openAssessment(target);
    }
  }, [location.search, location.state, data.assessments, loading]);

  useEffect(() => {
    if (!selected?.attempt?.due_at || selected?.attempt?.status !== 'in_progress') {
      setTimeLeft(0);
      return undefined;
    }

    setTimeLeft(secondsLeft(selected.attempt.due_at));
    const timer = setInterval(() => {
      setTimeLeft(secondsLeft(selected.attempt.due_at));
    }, 1000);

    return () => clearInterval(timer);
  }, [selected]);

  const visibleAssessments = useMemo(() => {
    if (filterType === 'all') return data.assessments;
    return data.assessments.filter((item) => item.assessment_type === filterType);
  }, [data.assessments, filterType]);

  async function openAssessment(item) {
    setDetailLoading(true);
    setError('');
    setMessage('');
    setSubmissionText('');
    setSubmissionFile(null);
    setAnswers({});
    setQuizReview(null);

    try {
      const response = await assessmentAPI.studentDetail(item.id);
      const detail = response.data?.data;
      setSelected(detail);
      if (detail?.submission?.submission_text) setSubmissionText(detail.submission.submission_text);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not open this item.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function submitAssignment(event) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await assessmentAPI.submitAssignment(selected.id, { submission_text: submissionText }, submissionFile);
      setMessage('Assignment submitted successfully.');
      await openAssessment(selected);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not submit assignment.');
    } finally {
      setSaving(false);
    }
  }

  async function startQuiz() {
    if (!selected) return;
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await assessmentAPI.startQuiz(selected.id);
      setSelected((current) => ({ ...current, attempt: response.data?.data }));
      setMessage('Quiz started. Timer is running.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not start quiz.');
    } finally {
      setSaving(false);
    }
  }

  function setChoice(question, optionId, checked) {
    setAnswers((current) => {
      const currentAnswer = current[question.id] || { question_id: question.id, selected_option_ids: [] };
      let selectedIds = currentAnswer.selected_option_ids || [];

      if (question.question_type === 'single_choice') {
        selectedIds = [optionId];
      } else if (checked) {
        selectedIds = Array.from(new Set([...selectedIds, optionId]));
      } else {
        selectedIds = selectedIds.filter((id) => id !== optionId);
      }

      return {
        ...current,
        [question.id]: { ...currentAnswer, selected_option_ids: selectedIds }
      };
    });
  }

  function setTextAnswer(question, text) {
    setAnswers((current) => ({
      ...current,
      [question.id]: { question_id: question.id, answer_text: text, selected_option_ids: [] }
    }));
  }

  async function submitQuiz() {
    if (!selected) return;
    const ok = window.confirm('Submit quiz now? You cannot change answers after submitting.');
    if (!ok) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await assessmentAPI.submitQuiz(selected.id, Object.values(answers));
      setMessage(`Quiz submitted. Score: ${response.data?.data?.score ?? 0} / ${response.data?.data?.max_score ?? selected.points}`);
      await openAssessment(selected);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not submit quiz.');
    } finally {
      setSaving(false);
    }
  }

  async function openQuizReview() {
    if (!selected) return;
    setReviewLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await assessmentAPI.studentQuizReview(selected.id);
      setQuizReview(response.data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not open quiz review.');
    } finally {
      setReviewLoading(false);
    }
  }

  return (
    <div className="student-assess-page">
      <section className="student-assess-hero">
        <div>
          <span>Assessments</span>
          <h1>Assignments & quizzes</h1>
          <p>Submit assignments before the deadline and complete quizzes inside the time limit set by your professor.</p>
        </div>
        <div className="student-assess-stats">
          <strong>{data.assessments.length}</strong><span>total</span>
          <strong>{visibleAssessments.filter((item) => statusOf(item) === 'Open now').length}</strong><span>open now</span>
        </div>
      </section>

      <section className="student-assess-toolbar">
        <label>
          Academic year
          <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
            <option value="2025/2026">2025/2026</option>
            <option value="2024/2025">2024/2025</option>
            <option value="2023/2024">2023/2024</option>
          </select>
        </label>
        <label>
          Semester
          <select value={semester} onChange={(e) => setSemester(e.target.value)}>
            <option value="fall">First Semester</option>
            <option value="spring">Second Semester</option>
            <option value="summer">Summer Semester</option>
          </select>
        </label>
        <label>
          Course
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="all">All enrolled courses</option>
            {data.sections.map((section) => (
              <option key={section.section_id} value={section.section_id}>
                {section.course_code} §{section.section_number} — {section.course_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All</option>
            <option value="assignment">Assignments</option>
            <option value="quiz">Quizzes</option>
          </select>
        </label>
      </section>

      {error && <div className="student-assess-alert student-assess-alert--error">{error}</div>}
      {message && <div className="student-assess-alert student-assess-alert--ok">{message}</div>}

      {loading ? <Spinner center /> : (
        <div className="student-assess-layout">
          <section className="student-assess-list">
            {visibleAssessments.length === 0 ? (
              <div className="student-assess-empty">No assignments or quizzes found for the selected filters.</div>
            ) : visibleAssessments.map((item) => (
              <article key={item.id} className={`student-assess-item student-assess-item--${statusOf(item).toLowerCase().replace(/\s+/g, '-')}`}>
                <div>
                  <div className="student-assess-badges">
                    <span>{item.assessment_type}</span>
                    {item.week_number && <span>Week {item.week_number}</span>}
                    <span>{statusOf(item)}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.course_code} §{item.section_number} · {item.instructor_name || 'Professor'}</p>
                  <small>Opens {dateTimeLabel(item.opens_at)} · Due {dateTimeLabel(item.closes_at)} · {item.points} pts</small>
                </div>
                <button className="student-assess-btn student-assess-btn--primary" onClick={() => openAssessment(item)}>
                  Open
                </button>
              </article>
            ))}
          </section>

          <section className="student-assess-detail">
            {detailLoading ? <Spinner center /> : !selected ? (
              <div className="student-assess-empty">Select an assignment or quiz to view details.</div>
            ) : selected.assessment_type === 'assignment' ? (
              <AssignmentPanel
                key={selected.id}
                selected={selected}
                submissionText={submissionText}
                setSubmissionText={setSubmissionText}
                setSubmissionFile={setSubmissionFile}
                submitAssignment={submitAssignment}
                saving={saving}
              />
            ) : (
              <QuizPanel
                selected={selected}
                answers={answers}
                setChoice={setChoice}
                setTextAnswer={setTextAnswer}
                startQuiz={startQuiz}
                submitQuiz={submitQuiz}
                saving={saving}
                timeLeft={timeLeft}
                openQuizReview={openQuizReview}
                quizReview={quizReview}
                reviewLoading={reviewLoading}
                closeQuizReview={() => setQuizReview(null)}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function fileIcon(type, name) {
  const mime = (type || '').toLowerCase();
  const ext = name ? name.split('.').pop().toLowerCase() : '';
  if (mime.includes('pdf') || ext === 'pdf') return '📄';
  if (mime.includes('word') || mime.includes('.document') || ext === 'doc' || ext === 'docx') return '📝';
  if (mime.includes('powerpoint') || mime.includes('.presentation') || ext === 'ppt' || ext === 'pptx') return '📊';
  if (mime.includes('excel') || mime.includes('.sheet') || ext === 'xls' || ext === 'xlsx') return '📋';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return '🖼️';
  if (mime.includes('zip') || mime.includes('compressed') || ext === 'zip' || ext === 'rar') return '🗜️';
  if (mime.includes('text') || ext === 'txt') return '📃';
  return '📎';
}

function fileExtLabel(type, name) {
  if (name) {
    const parts = name.split('.');
    if (parts.length > 1) return parts[parts.length - 1].toUpperCase();
  }
  const mimeMap = {
    'application/pdf': 'PDF',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.ms-powerpoint': 'PPT',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WEBP',
    'text/plain': 'TXT', 'application/zip': 'ZIP',
  };
  return mimeMap[type] || '';
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentRow({ att, idx }) {
  const icon = fileIcon(att.file_type, att.file_name);
  const ext = fileExtLabel(att.file_type, att.file_name);
  const size = formatFileSize(att.file_size);
  return (
    <a
      href={publicFileUrl(att.file_url)}
      target="_blank"
      rel="noreferrer"
      className="attachment-row"
      download={att.file_name || undefined}
    >
      <span className="attachment-row__icon">{icon}</span>
      <span className="attachment-row__info">
        <span className="attachment-row__name">{att.file_name || `File ${idx + 1}`}</span>
        {(ext || size) && (
          <span className="attachment-row__meta">
            {ext && <span className="attachment-row__ext">{ext}</span>}
            {size && <span className="attachment-row__size">{size}</span>}
          </span>
        )}
      </span>
      <span className="attachment-row__btn">Download</span>
    </a>
  );
}

function AssignmentPanel({ selected, submissionText, setSubmissionText, setSubmissionFile, submitAssignment, saving }) {
  const status = statusOf(selected);
  const notOpen = status === 'Scheduled';
  const closedNoLate = status === 'Closed' && !selected.allow_late;
  const canSubmit = !notOpen && !closedNoLate;
  const [editing, setEditing] = useState(!selected.submission && canSubmit);
  const [fileName, setFileName] = useState('');

  const attachments = Array.isArray(selected.attachments) && selected.attachments.length > 0
    ? selected.attachments
    : selected.attachment_url
      ? [{ id: null, file_url: selected.attachment_url, file_name: selected.attachment_name || 'Attachment', file_type: selected.attachment_type || null, file_size: selected.attachment_size || null }]
      : [];

  function chooseFile(file) {
    setSubmissionFile(file || null);
    setFileName(file?.name || '');
  }

  function onDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) chooseFile(file);
  }

  async function onSubmit(event) {
    await submitAssignment(event);
    setEditing(false);
  }

  return (
    <div className="assignment-panel">
      <div className="assignment-panel__header">
        <div className="assignment-panel__header-left">
          <span className="assignment-panel__course">{selected.course_code} §{selected.section_number}</span>
          <h2 className="assignment-panel__title">{selected.title}</h2>
        </div>
        <span className={`assignment-status-badge assignment-status-badge--${status.toLowerCase().replace(/\s+/g, '-')}`}>
          {status}
        </span>
      </div>

      <div className="assignment-meta">
        <div className="assignment-meta__item">
          <span className="assignment-meta__label">Opens</span>
          <span className="assignment-meta__value">{dateTimeLabel(selected.opens_at)}</span>
        </div>
        <div className="assignment-meta__item">
          <span className="assignment-meta__label">Due</span>
          <span className="assignment-meta__value">{dateTimeLabel(selected.closes_at)}</span>
        </div>
        <div className="assignment-meta__item">
          <span className="assignment-meta__label">Points</span>
          <span className="assignment-meta__value">{selected.points} pts</span>
        </div>
      </div>

      <div className="assignment-section">
        <div className="assignment-section__label">Description / Instructions</div>
        <p className="assignment-description">{selected.description || 'No instructions provided.'}</p>
      </div>

      {attachments.length > 0 && (
        <div className="assignment-section">
          <div className="assignment-section__label">Assignment files</div>
          <div className="assignment-attachments">
            {attachments.map((att, idx) => (
              <AttachmentRow key={att.id || idx} att={att} idx={idx} />
            ))}
          </div>
        </div>
      )}

      {notOpen && (
        <div className="assignment-not-open">
          <span className="assignment-not-open__icon">🕐</span>
          <div>
            <strong>Submissions not open yet</strong>
            <p>This assignment opens on {dateTimeLabel(selected.opens_at)}.</p>
          </div>
        </div>
      )}

      {!notOpen && !editing && (
        <div className="submission-status-card">
          <button
            className="student-assess-btn student-assess-btn--primary"
            type="button"
            onClick={() => setEditing(true)}
            disabled={!canSubmit}
          >
            {selected.submission ? 'Edit submission' : 'Add submission'}
          </button>

          <h3>Submission status</h3>
          <table>
            <tbody>
              <tr>
                <th>Submission status</th>
                <td>{selected.submission ? 'Submitted for grading' : 'No submissions have been made yet'}</td>
              </tr>
              <tr>
                <th>Grading status</th>
                <td>
                  {selected.submission?.grade !== null && selected.submission?.grade !== undefined
                    ? `Graded: ${selected.submission.grade} / ${selected.points}`
                    : 'Not graded'}
                </td>
              </tr>
              <tr>
                <th>Time remaining</th>
                <td>{closedNoLate ? 'Deadline passed' : 'Open for submission'}</td>
              </tr>
              <tr>
                <th>Last modified</th>
                <td>{selected.submission ? dateTimeLabel(selected.submission.submitted_at) : '—'}</td>
              </tr>
              <tr>
                <th>File submissions</th>
                <td>
                  {selected.submission?.file_url ? (
                    <a href={publicFileUrl(selected.submission.file_url)} target="_blank" rel="noreferrer">Open submitted file</a>
                  ) : '—'}
                </td>
              </tr>
              <tr>
                <th>Submission comments</th>
                <td>{selected.submission?.feedback || 'No comments yet'}</td>
              </tr>
            </tbody>
          </table>
          {closedNoLate && <small className="danger-text">Deadline passed. Late submissions are not allowed.</small>}
        </div>
      )}

      {!notOpen && editing && (
        <form className="student-submit-form moodle-submit-form" onSubmit={onSubmit}>
          <h3>{selected.submission ? 'Edit submission' : 'Add submission'}</h3>

          <label>
            Submission text
            <textarea value={submissionText} onChange={(e) => setSubmissionText(e.target.value)} rows="5" placeholder="Write your answer or notes here..." />
          </label>

          <div className="file-submission-field">
            <span className="file-submission-label">File submissions</span>
            <div
              className="drop-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
            >
              <input id={`submission-file-${selected.id}`} type="file" onChange={(e) => chooseFile(e.target.files?.[0] || null)} />
              <label htmlFor={`submission-file-${selected.id}`} className="drop-zone__button">Choose file</label>
              <div className="drop-zone__content">
                <strong>⬇</strong>
                <span>{fileName || 'Drag and drop a file here or choose a file.'}</span>
                <small>Maximum file size: 50 MB</small>
              </div>
            </div>
          </div>

          {selected.submission?.file_url && !fileName && (
            <div className="current-file-note">
              Current file: <a href={publicFileUrl(selected.submission.file_url)} target="_blank" rel="noreferrer">Open submitted file</a>
            </div>
          )}

          <div className="submission-actions">
            <button className="student-assess-btn student-assess-btn--primary" disabled={saving || !canSubmit}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <button className="student-assess-btn student-assess-btn--light" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>

          {closedNoLate && <small className="danger-text">Deadline passed. Late submissions are not allowed.</small>}
        </form>
      )}
    </div>
  );
}

function QuizPanel({ selected, answers, setChoice, setTextAnswer, startQuiz, submitQuiz, saving, timeLeft, openQuizReview, quizReview, reviewLoading, closeQuizReview }) {
  const status = statusOf(selected);
  const attempt = selected.attempt;
  const inProgress = attempt?.status === 'in_progress';
  const submitted = attempt?.status === 'submitted';

  return (
    <div className="student-assess-card">
      <div className="student-assess-card__head">
        <div>
          <span>{selected.course_code} §{selected.section_number}</span>
          <h2>{selected.title}</h2>
        </div>
        <strong>{submitted ? 'Submitted' : status}</strong>
      </div>

      <p>{selected.description || 'No instructions were added.'}</p>
      <div className="student-assess-info">
        <span>Opens: {dateTimeLabel(selected.opens_at)}</span>
        <span>Closes: {dateTimeLabel(selected.closes_at)}</span>
        <span>Duration: {selected.duration_minutes} minutes</span>
        <span>Points: {selected.points}</span>
      </div>

      {submitted && (
        <div className="submitted-box">
          <strong>Quiz submitted</strong>
          <span>Submitted: {dateTimeLabel(attempt.submitted_at)}</span>
          <span>Score: {attempt.score ?? 'Pending'} </span>
          {selected.allow_review ? (
            <button className="student-assess-btn student-assess-btn--primary" type="button" disabled={reviewLoading} onClick={openQuizReview}>
              {reviewLoading ? 'Loading review...' : 'Review quiz'}
            </button>
          ) : (
            <small>Quiz review is not enabled by the professor yet.</small>
          )}
        </div>
      )}

      {quizReview && (
        <StudentQuizReview review={quizReview} onClose={closeQuizReview} />
      )}

      {!attempt && status === 'Open now' && (
        <button className="student-assess-btn student-assess-btn--primary" disabled={saving} onClick={startQuiz}>
          {saving ? 'Starting...' : 'Start quiz'}
        </button>
      )}

      {!attempt && status !== 'Open now' && (
        <div className="student-assess-empty">This quiz is not open now.</div>
      )}

      {inProgress && (
        <div className="quiz-taking">
          <div className={`quiz-timer ${timeLeft <= 60 ? 'quiz-timer--danger' : ''}`}>
            Time left: {formatSeconds(timeLeft)}
          </div>

          {(selected.questions || []).map((question, index) => (
            <div key={question.id} className="student-question">
              <div className="student-question__head">
                <strong>Question {index + 1}</strong>
                <span>{question.points} pts</span>
              </div>
              <p>{question.question_text}</p>
              {question.question_image_url && (
                <img
                  className="student-question-image"
                  src={publicFileUrl(question.question_image_url)}
                  alt={`Question ${index + 1}`}
                />
              )}

              {question.question_type === 'text' ? (
                <textarea
                  rows="4"
                  value={answers[question.id]?.answer_text || ''}
                  onChange={(e) => setTextAnswer(question, e.target.value)}
                  placeholder="Write your answer"
                />
              ) : (
                <div className="student-options">
                  {(question.options || []).map((option) => {
                    const selectedIds = answers[question.id]?.selected_option_ids || [];
                    const checked = selectedIds.includes(option.id);
                    return (
                      <label key={option.id}>
                        <input
                          type={question.question_type === 'single_choice' ? 'radio' : 'checkbox'}
                          name={`question-${question.id}`}
                          checked={checked}
                          onChange={(e) => setChoice(question, option.id, e.target.checked)}
                        />
                        {option.option_text}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <button className="student-assess-btn student-assess-btn--primary" disabled={saving || timeLeft <= 0} onClick={submitQuiz}>
            {saving ? 'Submitting...' : 'Submit quiz'}
          </button>
          {timeLeft <= 0 && <small className="danger-text">Time is over. Refresh the quiz to see the latest status.</small>}
        </div>
      )}
    </div>
  );
}


function StudentQuizReview({ review, onClose }) {
  const { assessment, attempt, questions = [] } = review || {};
  const maxScore = questions.reduce((sum, question) => sum + Number(question.points || 0), 0);

  return (
    <div className="student-review-card">
      <div className="student-review-head">
        <div>
          <h3>Quiz review</h3>
          <small>{assessment?.title}</small>
        </div>
        <div className="student-review-score">
          <strong>{attempt?.score ?? 0} / {maxScore || assessment?.points || 0}</strong>
          <span>Submitted {dateTimeLabel(attempt?.submitted_at)}</span>
        </div>
        <button className="student-assess-btn student-assess-btn--light" type="button" onClick={onClose}>Hide review</button>
      </div>

      {questions.map((question, index) => (
        <StudentReviewQuestion key={question.id} question={question} index={index} />
      ))}
    </div>
  );
}

function StudentReviewQuestion({ question, index }) {
  const answer = question.answer || {};
  const selectedIds = Array.isArray(answer.selected_option_ids) ? answer.selected_option_ids : [];

  return (
    <div className="student-review-question">
      <div className="student-review-question__head">
        <strong>Question {index + 1}</strong>
        <span>{answer.points_awarded ?? 0} / {question.points} pts</span>
      </div>
      <p>{question.question_text}</p>
      {question.question_image_url && (
        <img className="student-question-image" src={publicFileUrl(question.question_image_url)} alt={`Question ${index + 1}`} />
      )}

      {question.question_type === 'text' ? (
        <div className="student-review-text-answer">
          <strong>Your answer</strong>
          <p>{answer.answer_text || 'No answer submitted.'}</p>
        </div>
      ) : (
        <div className="student-review-options">
          {(question.options || []).map((option) => {
            const selected = selectedIds.includes(option.id);
            const className = [
              'student-review-option',
              option.is_correct ? 'student-review-option--correct' : '',
              selected ? 'student-review-option--selected' : '',
              selected && !option.is_correct ? 'student-review-option--wrong' : ''
            ].filter(Boolean).join(' ');

            return (
              <div key={option.id} className={className}>
                <span>{option.option_text}</span>
                <small>
                  {option.is_correct ? 'Correct answer' : ''}
                  {selected ? (option.is_correct ? ' · Your answer' : 'Your answer') : ''}
                </small>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}