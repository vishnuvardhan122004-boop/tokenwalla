"""
Scan reports — who may upload, who may read, and who may not.

A scan report is medical PII. The access rules are the feature; the upload is
almost incidental. So most of this file is negative assertions, and the one that
matters most is that the storage URL never appears in any response — a URL is a
bearer token, and a WhatsApp message is forwardable.

Every test that reaches the upload endpoint patches
`scans.views._notify_report_ready_async`. That thread writes a WhatsAppLog row
and outlives the test; unpatched it collides with a later, unrelated test's
first write against the shared-cache SQLite. See CLAUDE.md.
"""
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital
from scans.models import Scan, ScanReport

User = get_user_model()


def a_pdf(name='report.pdf'):
    return SimpleUploadedFile(name, b'%PDF-1.4 fake report', content_type='application/pdf')


@mock.patch('scans.views._notify_report_ready_async', lambda r: None)
class ScanReportAccessTests(TestCase):
    def setUp(self):
        self.patient = User.objects.create(
            username='patient', mobile='9000000801', first_name='Rahul')
        self.other_patient = User.objects.create(
            username='other', mobile='9000000802', first_name='Someone Else')

        self.centre = Hospital.objects.create(
            name='Vijaya Diagnostics', city='Hindupur', mobile='9000000803',
            status='active', password='x', kind=Hospital.SCAN_CENTER)
        self.other_centre = Hospital.objects.create(
            name='Lucid Diagnostics', city='Hindupur', mobile='9000000804',
            status='active', password='x', kind=Hospital.SCAN_CENTER)

        self.scan = Scan.objects.create(
            center=self.centre, name='MRI Brain', price=4500, slots=['09:00 AM'])
        self.booking = Booking.objects.create(
            user=self.patient, scan=self.scan, hospital=self.centre,
            date=timezone.localdate() - timedelta(days=1), slot='09:00 AM',
            token='TW-RPT-1', status=Booking.COMPLETED)

        self.url = f'/api/bookings/{self.booking.id}/reports/'

    def client_for(self, user):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def centre_client(self, centre):
        staff = User.objects.create(
            username=f'centre-{centre.id}', mobile=f'90000009{centre.id:02d}',
            role='hospital', last_name=str(centre.id))
        return self.client_for(staff)

    def upload(self, client=None):
        return (client or self.centre_client(self.centre)).post(
            self.url, {'file': a_pdf(), 'title': 'MRI Brain report'}, format='multipart')

    # ── upload ───────────────────────────────────────────────────────────────
    def test_the_centre_can_upload(self):
        r = self.upload()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(ScanReport.objects.count(), 1)

    def test_a_patient_cannot_upload_their_own_report(self):
        """Reading your report and publishing one are different powers."""
        r = self.upload(self.client_for(self.patient))
        self.assertEqual(r.status_code, 404)
        self.assertEqual(ScanReport.objects.count(), 0)

    def test_another_centre_cannot_upload(self):
        r = self.upload(self.centre_client(self.other_centre))
        self.assertEqual(r.status_code, 404)
        self.assertEqual(ScanReport.objects.count(), 0)

    def test_anonymous_cannot_upload(self):
        r = APIClient().post(self.url, {'file': a_pdf()}, format='multipart')
        self.assertIn(r.status_code, (401, 403))

    def test_a_doctor_booking_cannot_take_a_report(self):
        hospital = Hospital.objects.create(
            name='Sri Sarwodhaya', city='Hindupur', mobile='9000000805',
            status='active', password='x')
        doctor = Doctor.objects.create(
            hospital=hospital, name='Dr Rao', specialization='GP',
            mobile='9000000806', fee=200, slots=['09:00 AM'])
        b = Booking.objects.create(
            user=self.patient, doctor=doctor, hospital=hospital,
            date=timezone.localdate(), slot='09:00 AM', token='TW-DOC-1')
        r = self.centre_client(hospital).post(
            f'/api/bookings/{b.id}/reports/', {'file': a_pdf()}, format='multipart')
        self.assertEqual(r.status_code, 400)

    def test_a_file_is_required(self):
        r = self.centre_client(self.centre).post(self.url, {'title': 'x'}, format='multipart')
        self.assertEqual(r.status_code, 400)

    # ── read ─────────────────────────────────────────────────────────────────
    def test_the_patient_can_list_their_reports(self):
        self.upload()
        r = self.client_for(self.patient).get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 1)

    def test_another_patient_cannot_list_them(self):
        self.upload()
        r = self.client_for(self.other_patient).get(self.url)
        self.assertEqual(r.status_code, 404)

    def test_another_centre_cannot_list_them(self):
        self.upload()
        r = self.centre_client(self.other_centre).get(self.url)
        self.assertEqual(r.status_code, 404)

    def test_the_response_never_exposes_the_storage_url(self):
        """The whole privacy model in one assertion. A storage URL is a bearer
        token — anyone holding it reads the report forever, with no login."""
        self.upload()
        body = self.client_for(self.patient).get(self.url).json()
        blob = str(body)
        self.assertNotIn('scan_reports/', blob)
        self.assertNotIn('.pdf', body[0]['download_url'])
        self.assertNotIn('file', body[0])
        self.assertTrue(body[0]['download_url'].endswith('/download/'))

    # ── download ─────────────────────────────────────────────────────────────
    def test_the_patient_can_download(self):
        rid = self.upload().json()['id']
        r = self.client_for(self.patient).get(f'{self.url}{rid}/download/')
        self.assertEqual(r.status_code, 200)
        self.assertIn(b'%PDF', b''.join(r.streaming_content))

    def test_another_patient_cannot_download(self):
        rid = self.upload().json()['id']
        r = self.client_for(self.other_patient).get(f'{self.url}{rid}/download/')
        self.assertEqual(r.status_code, 404)

    def test_anonymous_cannot_download(self):
        rid = self.upload().json()['id']
        r = APIClient().get(f'{self.url}{rid}/download/')
        self.assertIn(r.status_code, (401, 403))

    def test_a_report_cannot_be_fetched_through_someone_elses_booking(self):
        """The report id alone must never be enough — access is decided by the
        BOOKING, which is why the route is nested under it."""
        rid = self.upload().json()['id']
        victim_booking = Booking.objects.create(
            user=self.other_patient, scan=self.scan, hospital=self.centre,
            date=timezone.localdate(), slot='09:00 AM', token='TW-RPT-2')
        r = self.client_for(self.other_patient).get(
            f'/api/bookings/{victim_booking.id}/reports/{rid}/download/')
        self.assertEqual(r.status_code, 404)


class ScanReportNotifyTests(TestCase):
    """The notification is fire-and-forget and must never fail the upload."""

    def setUp(self):
        self.patient = User.objects.create(username='p2', mobile='9000000810')
        self.centre = Hospital.objects.create(
            name='Vijaya', city='Hindupur', mobile='9000000811',
            status='active', password='x', kind=Hospital.SCAN_CENTER)
        self.scan = Scan.objects.create(center=self.centre, name='CBC', price=300)
        self.booking = Booking.objects.create(
            user=self.patient, scan=self.scan, hospital=self.centre,
            date=timezone.localdate(), slot='09:00 AM', token='TW-RPT-9',
            status=Booking.COMPLETED)
        staff = User.objects.create(
            username='centre-staff', mobile='9000000812',
            role='hospital', last_name=str(self.centre.id))
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(staff).access_token}')

    @mock.patch('scans.views._notify_report_ready_async')
    def test_upload_dispatches_the_notification(self, mock_notify):
        r = self.client.post(f'/api/bookings/{self.booking.id}/reports/',
                             {'file': a_pdf()}, format='multipart')
        self.assertEqual(r.status_code, 201)
        mock_notify.assert_called_once()

    @mock.patch('scans.views._notify_report_ready_async', side_effect=RuntimeError('meta down'))
    def test_a_failing_notification_still_stores_the_report(self, _m):
        """A centre re-uploading because the response errored would store the
        patient's report twice."""
        with self.assertRaises(RuntimeError):
            self.client.post(f'/api/bookings/{self.booking.id}/reports/',
                             {'file': a_pdf()}, format='multipart')
        self.assertEqual(ScanReport.objects.count(), 1)
