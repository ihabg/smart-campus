const API_ORIGIN = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api')
  .replace(/\/api\/?$/, '');

export function publicUrl(value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || /^data:/i.test(value) || /^blob:/i.test(value)) {
    return value;
  }
  return `${API_ORIGIN}${String(value).startsWith('/') ? value : `/${value}`}`;
}

export default publicUrl;
