"""
Removing or replacing a hospital's stored image must drop the old blob, not
just repoint the field.

Found during a full QA sweep: HospitalPhotoDeleteView only ever did
`HospitalPhoto.objects.filter(...).delete()`, which removes the DB row but
leaves the underlying file sitting in storage forever — on Cloudinary that's
both a wasted-storage leak and a privacy issue (the "deleted" photo stays
reachable at its old URL indefinitely). scans/views.py already has the
correct pattern (`report.file.delete(save=False)` before dropping the row).
The same gap existed in HospitalDetailView.patch when replacing the banner
`image` or `logo` — the old file was never deleted before being repointed at
the new upload.
"""
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from hospitals.models import Hospital, HospitalPhoto

User = get_user_model()


def a_photo(name='facility.png'):
    return SimpleUploadedFile(name, b'fake image bytes', content_type='image/png')


class HospitalPhotoDeleteTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000002', password='x')
        self.staff = User.objects.create(
            username='9000000002', mobile='9000000002', role='hospital',
            last_name=str(self.hospital.id))

    def test_delete_removes_the_file_not_just_the_row(self):
        self.client.force_authenticate(self.staff)
        photo = HospitalPhoto.objects.create(hospital=self.hospital, image=a_photo())
        storage = photo.image.storage
        name = photo.image.name
        self.assertTrue(storage.exists(name))

        r = self.client.delete(f'/api/hospitals/{self.hospital.id}/photos/{photo.id}/')
        self.assertEqual(r.status_code, 200, r.content)

        self.assertFalse(HospitalPhoto.objects.filter(pk=photo.id).exists())
        self.assertFalse(storage.exists(name))

    def test_deleting_a_missing_photo_is_a_no_op(self):
        self.client.force_authenticate(self.staff)
        r = self.client.delete(f'/api/hospitals/{self.hospital.id}/photos/999999/')
        self.assertEqual(r.status_code, 200, r.content)


class HospitalBannerReplaceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000003', password='x',
            image=a_photo('old_banner.png'), logo=a_photo('old_logo.png'))
        self.staff = User.objects.create(
            username='9000000003', mobile='9000000003', role='hospital',
            last_name=str(self.hospital.id))

    def test_replacing_the_banner_deletes_the_old_file(self):
        self.client.force_authenticate(self.staff)
        storage = self.hospital.image.storage
        old_name = self.hospital.image.name
        self.assertTrue(storage.exists(old_name))

        r = self.client.patch(f'/api/hospitals/{self.hospital.id}/',
                               {'image': a_photo('new_banner.png')}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)

        self.assertFalse(storage.exists(old_name))
        self.hospital.refresh_from_db()
        self.assertNotEqual(self.hospital.image.name, old_name)

    def test_replacing_the_logo_deletes_the_old_file(self):
        self.client.force_authenticate(self.staff)
        storage = self.hospital.logo.storage
        old_name = self.hospital.logo.name
        self.assertTrue(storage.exists(old_name))

        r = self.client.patch(f'/api/hospitals/{self.hospital.id}/',
                               {'logo': a_photo('new_logo.png')}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)

        self.assertFalse(storage.exists(old_name))
        self.hospital.refresh_from_db()
        self.assertNotEqual(self.hospital.logo.name, old_name)
