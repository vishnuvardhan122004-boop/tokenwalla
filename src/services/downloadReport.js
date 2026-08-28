// Fetch a shared document (report, prescription, discharge summary) and hand
// the bytes to the browser.
//
// It is never a plain <a href>: the download endpoint re-checks ownership on
// every request and needs the Authorization header, so a bare link 401s. The
// storage URL is deliberately never exposed by the API — a URL is a bearer
// token and this is medical PII.
import API from './api';

export async function downloadReport(report) {
  const res = await API.get(String(report.download_url).replace(/^\/api/, ''), {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  // original_name, not the title: the extension is what decides whether the
  // saved file opens, and the storage does not keep it (Cloudinary strips it
  // from the public_id), so the server sends it back as its own field.
  a.download = report.original_name || `${report.title || 'document'}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
