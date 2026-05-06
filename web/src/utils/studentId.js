// ─── Student ID Parser — An-Najah National University ────────
// Format: BBBXXXXX where BBB = batch (first 3 digits)
// Example: 12143698 → batch = 121 → enrolled 2021 → Year 5 (2026)

/**
 * Extract batch number from student ID
 * @param {string|number} studentId
 * @returns {number|null} batch number (first 3 digits) or null if invalid
 */
export function extractBatch(studentId) {
  const str = String(studentId).replace(/\D/g, ''); // remove non-digits
  if (str.length < 3) return null;
  return parseInt(str.slice(0, 3));
}

/**
 * Get enrollment year from batch number
 * batch 121 → 2021, batch 120 → 2020, batch 125 → 2025
 * @param {number} batch
 * @returns {number} enrollment year (e.g. 2021)
 */
export function getEnrollmentYear(batch) {
  // batch 121 → last 2 digits = 21 → 2021
  const yearSuffix = batch % 100;
  return 2000 + yearSuffix;
}

/**
 * Calculate current year of study from student ID
 * @param {string|number} studentId
 * @returns {number|null} year of study (1-6) or null if invalid
 */
export function getYearOfStudy(studentId) {
  const batch = extractBatch(studentId);
  if (!batch) return null;

  const enrollmentYear = getEnrollmentYear(batch);
  const currentYear    = new Date().getFullYear();
  const yearsStudied   = currentYear - enrollmentYear + 1;

  // Clamp between 1 and 6 (engineering is 5 years, sometimes 6 with delays)
  if (yearsStudied < 1) return 1;
  if (yearsStudied > 6) return 6;
  return yearsStudied;
}

/**
 * Validate student ID format
 * @param {string} studentId
 * @returns {{ valid: boolean, error?: string, batch?: number, year?: number }}
 */
export function validateStudentId(studentId) {
  const str = String(studentId || '').trim();

  if (!str) return { valid: false, error: 'Student ID is required' };
  if (!/^\d+$/.test(str)) return { valid: false, error: 'Student ID must contain digits only' };
  if (str.length < 3)     return { valid: false, error: 'Student ID must have at least 3 digits' };

  const batch          = extractBatch(str);
  const enrollmentYear = getEnrollmentYear(batch);
  const year           = getYearOfStudy(str);
  const currentYear    = new Date().getFullYear();

  // Sanity check — enrollment year should be reasonable
  if (enrollmentYear < 2000 || enrollmentYear > currentYear + 1) {
    return { valid: false, error: `Invalid batch number: ${batch}` };
  }

  return { valid: true, batch, enrollmentYear, year };
}

/**
 * Generate student email from student ID
 * @param {string} studentId
 * @returns {string} e.g. s12143698@stu.najah.edu
 */
export function getStudentEmail(studentId) {
  return `s${studentId}@stu.najah.edu`;
}

// ─── Examples ──────────────────────────────────────────────
// 12143698 → batch=121 → enrolled 2021 → Year 5 (in 2026) ✓
// 12099999 → batch=120 → enrolled 2020 → Year 6 (in 2026) ✓
// 12512345 → batch=125 → enrolled 2025 → Year 2 (in 2026) ✓
