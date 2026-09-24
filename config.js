// API base URL for all TT-Kickbase frontend requests.
// Same-origin by default (backend serves the frontend in production, so a
// relative URL is correct). For local dev against a separate backend port,
// set a localStorage override once in the console:
//   localStorage.setItem('tt-api-base', 'http://localhost:3000')
(function () {
  var base = '';
  try {
    base = localStorage.getItem('tt-api-base') || '';
  } catch (e) { /* storage unavailable */ }
  window.TT_API_BASE = base;
})();
