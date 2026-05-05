# backend/doctors/admin.py
# ─────────────────────────────────────────────────────────────────────────────
# Custom admin for Doctors that:
#  1. Replaces the default delete with a safe cascade that cancels bookings first.
#  2. Shows live booking count + availability toggle.
#  3. Never shows the ugly ProtectedError wall.
# ─────────────────────────────────────────────────────────────────────────────

from django.contrib import admin, messages
from django.db import transaction
from django.utils.html import format_html

from .models import Doctor


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display  = ('name', 'specialization', 'experience', 'mobile',
                     'available', 'hospital', 'active_bookings', 'total_bookings')
    list_filter   = ('available', 'specialization')
    search_fields = ('name', 'specialization', 'mobile', 'hospital__name')
    actions       = ['mark_available', 'mark_unavailable', 'safe_delete_doctors']

    # ── Booking count columns ──────────────────────────────────────────────────

    @admin.display(description='Active')
    def active_bookings(self, obj):
        count = obj.bookings.filter(status__in=['waiting', 'in_progress']).count()
        if count:
            return format_html(
                '<span style="color:#854F0B;font-weight:700;background:#FAEEDA;'
                'padding:2px 8px;border-radius:6px">{} active</span>',
                count
            )
        return format_html('<span style="color:#64748B">0</span>')

    @admin.display(description='All-time')
    def total_bookings(self, obj):
        return obj.bookings.count()

    # ── Availability toggles ───────────────────────────────────────────────────

    @admin.action(description='✅ Mark selected doctors as Available')
    def mark_available(self, request, queryset):
        updated = queryset.update(available=True)
        self.message_user(request, f'{updated} doctor(s) marked as available.', messages.SUCCESS)

    @admin.action(description='⛔ Mark selected doctors as Unavailable')
    def mark_unavailable(self, request, queryset):
        updated = queryset.update(available=False)
        self.message_user(request, f'{updated} doctor(s) marked as unavailable.', messages.WARNING)

    # ── Safe delete (fixes "Delete failed. The doctor may have active bookings") ──

    @admin.action(description='🗑 Safely delete selected doctors (cancels bookings first)')
    def safe_delete_doctors(self, request, queryset):
        """
        The frontend error "Delete failed. The doctor may have active bookings."
        comes from the DoctorViewSet.destroy() guard in doctors/views.py.
        This admin action bypasses that by cancelling bookings first.
        """
        from bookings.models import Booking

        deleted = []
        errors  = []

        for doctor in queryset:
            try:
                with transaction.atomic():
                    # Cancel active bookings first
                    cancelled = Booking.objects.filter(
                        doctor=doctor,
                        status__in=['waiting', 'in_progress']
                    ).update(status='cancelled')

                    # Delete all booking records for this doctor
                    Booking.objects.filter(doctor=doctor).delete()

                    name = f'Dr. {doctor.name}'
                    doctor.delete()
                    deleted.append(f'{name} (cancelled {cancelled} active booking(s))')

            except Exception as exc:
                errors.append(f'Dr. {doctor.name}: {exc}')

        if deleted:
            self.message_user(
                request,
                f'Deleted {len(deleted)} doctor(s). Details: {"; ".join(deleted)}.',
                messages.SUCCESS
            )
        for err in errors:
            self.message_user(request, f'Error — {err}', messages.ERROR)

    # ── Remove dangerous default delete ───────────────────────────────────────

    def get_actions(self, request):
        actions = super().get_actions(request)
        if 'delete_selected' in actions:
            del actions['delete_selected']
        return actions

    # ── Single-object delete override ─────────────────────────────────────────

    def delete_model(self, request, obj):
        from bookings.models import Booking
        with transaction.atomic():
            Booking.objects.filter(
                doctor=obj,
                status__in=['waiting', 'in_progress']
            ).update(status='cancelled')
            Booking.objects.filter(doctor=obj).delete()
            obj.delete()