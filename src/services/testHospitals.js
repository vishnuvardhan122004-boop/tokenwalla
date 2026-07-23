// Test hospitals are named like "[TEST] Demo Hospital". They're always hidden
// from the public patient-facing doctor pages (in every build). Testers still
// reach them directly through the hospital login/dashboard.
export function isTestHospital(hospitalName) {
  return !!hospitalName && hospitalName.toUpperCase().includes('[TEST]');
}

// Drop doctors belonging to test hospitals from a public list.
export function filterTestDoctors(doctors) {
  return doctors.filter(d => !isTestHospital(d.hospital_name));
}
