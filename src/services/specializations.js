// Common doctor-specialization suggestions, shared by the doctor forms
// (hospital dashboard + admin panel). Rendered as a <datalist> so the field
// stays free-text — these are just quick picks that keep spelling consistent
// (e.g. "Dermatologist", not "dermotologist"; "Gynecologist", not "ginologist").
const SPECIALIZATION_OPTIONS = [
  "General Physician",
  "General Medicine",
  "General Surgeon",
  "Cardiologist",
  "Neurologist",
  "Neurosurgeon",
  "Dermatologist",
  "Gynecologist",
  "Obstetrician & Gynecologist",
  "Pediatrician",
  "Orthopedic Surgeon",
  "ENT Specialist",
  "Ophthalmologist",
  "Dentist",
  "Psychiatrist",
  "Urologist",
  "Nephrologist",
  "Gastroenterologist",
  "Pulmonologist",
  "Endocrinologist",
  "Diabetologist",
  "Oncologist",
  "Rheumatologist",
  "Radiologist",
  "Anesthesiologist",
  "Physiotherapist",
];

export default SPECIALIZATION_OPTIONS;
