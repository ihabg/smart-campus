import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axiosInstance';

function termFromSearch(search) {
  const p = new URLSearchParams(search);
  return {
    semester: p.get('semester') || '',
    academicYear: p.get('academic_year') || '',
  };
}

export default function useProfessorTerm() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [terms, setTerms] = useState([]);

  // resolvedTerm is local state — the source of truth for semester/academicYear.
  // Initialized from the URL so pages opened with ?semester=...&academic_year=... work immediately.
  const [resolvedTerm, setResolvedTerm] = useState(() =>
    termFromSearch(window.location.search)
  );

  // termLoading is true only while the /professor/terms fetch is in flight
  // AND we don't already have a term resolved from the URL.
  const initialHasTerm = useRef(
    Boolean(resolvedTerm.semester && resolvedTerm.academicYear)
  );
  const [termLoading, setTermLoading] = useState(!initialHasTerm.current);

  const didInit = useRef(false);

  // hasTerm is derived from local state only — never from searchParams directly.
  const hasTerm = !termLoading && Boolean(resolvedTerm.semester && resolvedTerm.academicYear);

  // Fetch available terms once on mount. When no term is in the URL yet,
  // atomically: set resolvedTerm + update URL + clear termLoading in one batch.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    api.get('/professor/terms')
      .then(r => {
        const rows = r.data?.data?.terms || [];
        setTerms(rows);

        if (!initialHasTerm.current) {
          if (rows.length) {
            const first = rows[0];
            // Set resolvedTerm and termLoading together so hasTerm flips to true
            // in the same render that termLoading becomes false.
            setResolvedTerm({ semester: first.semester, academicYear: first.academic_year });
            setSearchParams(
              { semester: first.semester, academic_year: first.academic_year },
              { replace: true }
            );
          }
          // Clear termLoading after resolvedTerm is set — React 18 batches these.
          setTermLoading(false);
        } else {
          // URL already had a term; just store the list, loading was already false.
          setTerms(rows);
        }
      })
      .catch(() => {
        if (!initialHasTerm.current) setTermLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync resolvedTerm from URL on back/forward navigation or manual URL changes.
  // Only runs when searchParams actually change (not on first mount — resolvedTerm
  // is already initialized from window.location.search above).
  const isFirstParamSync = useRef(true);
  useEffect(() => {
    if (isFirstParamSync.current) {
      isFirstParamSync.current = false;
      return;
    }
    const next = termFromSearch(window.location.search);
    if (next.semester && next.academicYear) {
      setResolvedTerm(next);
    }
  }, [searchParams]);

  const setTerm = useCallback((sem, year) => {
    setResolvedTerm({ semester: sem, academicYear: year });
    setSearchParams({ semester: sem, academic_year: year });
  }, [setSearchParams]);

  return {
    semester: resolvedTerm.semester,
    academicYear: resolvedTerm.academicYear,
    terms,
    termLoading,
    hasTerm,
    setTerm,
  };
}
