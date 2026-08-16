"""
Tests for the "update the app" broadcast.

The load-bearing property is the one that can't be fixed later: the payload
must NOT carry a `screen` key. Installed builds route a notification tap on
`data.screen` and their handler ships with the build — a value they don't know
would need an app release to understand, which is precisely what an out-of-date
install cannot do. With the key absent the tap simply opens the app, and the
launch-time version gate does the blocking.

The other check is that a broadcast to every real device doesn't leave on a
bare command.

Run:  python manage.py test notifications.tests_app_update_push
"""
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from notifications.models import DeviceToken
from notifications.push import push_app_update
from users.models import User


class AppUpdatePushTests(TestCase):
    def setUp(self):
        self.patient = User.objects.create(username='9111111111', mobile='9111111111',
                                           role='patient')
        self.staff = User.objects.create(username='9222222222', mobile='9222222222',
                                         role='hospital', last_name='1')
        DeviceToken.objects.create(user=self.patient, expo_token='ExponentPushToken[pat]',
                                   role='patient')
        DeviceToken.objects.create(user=self.staff, expo_token='ExponentPushToken[hosp]',
                                   role='hospital')

    @mock.patch('notifications.push._send')
    def test_payload_carries_no_screen_key(self, send):
        """A tap must fall through to "just open the app" on every installed build."""
        push_app_update('1.3.0')

        data = send.call_args.kwargs['data']
        self.assertNotIn('screen', data)
        self.assertEqual(data['type'], 'app_update')
        self.assertEqual(data['appId'], 'appupdate-1.3.0')

    @mock.patch('notifications.push._send')
    def test_reaches_every_role_by_default(self, send):
        push_app_update('1.3.0')

        sent = [(c.args[0], c.kwargs['data']['audience']) for c in send.call_args_list]
        self.assertCountEqual(
            sent,
            [(['ExponentPushToken[pat]'], 'patient'), (['ExponentPushToken[hosp]'], 'hospital')],
        )

    @mock.patch('notifications.push._send')
    def test_audience_matches_the_recipient(self, send):
        """Otherwise a hospital staffer finds the notice in their patient tab."""
        push_app_update('1.3.0', role='hospital')

        self.assertEqual(send.call_args.kwargs['data']['audience'], 'hospital')

    @mock.patch('notifications.push._send')
    def test_role_filter_narrows_the_broadcast(self, send):
        push_app_update('1.3.0', role='patient')

        self.assertEqual(send.call_args.args[0], ['ExponentPushToken[pat]'])

    @mock.patch('notifications.push._send')
    def test_custom_message_overrides_the_body(self, send):
        push_app_update('1.3.0', message='Queue view is much faster.')

        body = send.call_args.kwargs['body']
        self.assertEqual(body, 'Queue view is much faster.')

    @mock.patch('notifications.push._send')
    def test_command_sends_nothing_without_the_send_flag(self, send):
        """A broadcast to every live install can't be recalled — so it's opt-in."""
        call_command('send_update_push', '1.3.0')

        send.assert_not_called()

    @mock.patch('notifications.push._send')
    def test_command_sends_with_the_send_flag(self, send):
        call_command('send_update_push', '1.3.0', '--send')

        self.assertTrue(send.called)
