"""
The hospital lists must not cost a query per hospital.

HospitalSerializer.get_gallery reads `obj.photos.all()`. Neither list view
prefetched it, so serialising N hospitals issued N extra queries — on
HospitalListView, which is PUBLIC and is the browse page every patient loads
before booking anything, and on the admin list, which is unpaginated and also
includes pending and rejected rows.

The assertion that matters is not the absolute number, it is that adding
hospitals does not add queries.

Run:  python manage.py test hospitals.tests_list_queries
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from hospitals.models import Hospital, HospitalPhoto

User = get_user_model()


class HospitalListQueryCountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self._n = 0

    def make_hospitals(self, count, *, photos=2):
        for _ in range(count):
            self._n += 1
            h = Hospital.objects.create(
                name=f'Clinic {self._n}', city='Hyd', status='active',
                mobile=f'90000{self._n:05d}', password='x')
            for _ in range(photos):
                # image left blank: get_gallery filters those out, but only
                # AFTER the related manager has been hit — which is the query
                # this test is about.
                HospitalPhoto.objects.create(hospital=h)

    def _count(self, url, hospitals):
        Hospital.objects.all().delete()
        self._n = 0
        self.make_hospitals(hospitals)
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get(url)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(len(res.data), hospitals)
        return len(ctx)

    def test_public_list_does_not_grow_with_hospitals(self):
        self.assertEqual(self._count('/api/hospitals/', 2),
                         self._count('/api/hospitals/', 10))

    def test_admin_list_does_not_grow_with_hospitals(self):
        admin = User.objects.create(
            username='adm', mobile='9111000001', role='admin', is_staff=True)
        self.client.force_authenticate(user=admin)
        self.assertEqual(self._count('/api/hospitals/admin/all/', 2),
                         self._count('/api/hospitals/admin/all/', 10))
