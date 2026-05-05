from django.contrib import admin, messages
from django.db import transaction
from django.utils.html import format_html
 
from .models import Hospital
 
 
@admin.register(Hospital)
class HospitalAdmin(admin.ModelAdmin):
    list_display  = ('name', 'city', 'mobile', 'status', 'booking_count', 'doctor_count', 'created')
    search_fields = ('name', 'city', 'mobile')
    list_filter   = ('status',)
    actions       = ['approve_hospitals', 'reject_hospitals', 'safe_delete_hospitals']

        # ── Read-only computed columns ─────────────────────────────────────────────
 
    @admin.display(description='Bookings')
    def booking_count(self, obj):
        count = obj.bookings.count()
        active = obj.bookings.filter(status__in=['waiting', 'in_progress']).count()
        if active:
            return format_html(
                '<span style="color:#854F0B;font-weight:600">{} ({} active)</span>',
                count, active
            )
        return count
 
    @admin.display(description='Doctors')
    def doctor_count(self, obj):
        return obj.doctors.count()
 
    # ── Bulk approve ───────────────────────────────────────────────────────────
 
    @admin.action(description='✅ Approve selected hospitals')
    def approve_hospitals(self, request, queryset):
        from django.contrib.auth import get_user_model
        User = get_user_model()
 
        updated = 0
        for hospital in queryset.exclude(status='active'):
            hospital.status = 'active'
            hospital.save(update_fields=['status'])
            # Activate the linked user so they can log in
            User.objects.filter(mobile=hospital.mobile).update(is_active=True)
            updated += 1
 
        self.message_user(
            request,
            f'{updated} hospital(s) approved and set to active.',
            messages.SUCCESS
        )
 
    # ── Bulk reject ────────────────────────────────────────────────────────────
 
    @admin.action(description='🚫 Reject selected hospitals')
    def reject_hospitals(self, request, queryset):
        from django.contrib.auth import get_user_model
        User = get_user_model()
 
        updated = 0
        for hospital in queryset.exclude(status='rejected'):
            hospital.status = 'rejected'
            hospital.save(update_fields=['status'])
            User.objects.filter(mobile=hospital.mobile).update(is_active=False)
            updated += 1
 
        self.message_user(
            request,
            f'{updated} hospital(s) rejected.',
            messages.WARNING
        )
 
    # ── Safe delete (the KEY fix for the screenshot problem) ──────────────────
 
    @admin.action(description='🗑 Safely delete selected hospitals (cancels active bookings first)')
    def safe_delete_hospitals(self, request, queryset):
        """
        Django admin's built-in delete hits `on_delete=PROTECT` on bookings
        and shows the ugly wall of protected-object links the user saw.
 
        This action instead:
          1. Cancels any waiting/in_progress bookings.
          2. Deletes all doctors (after cancelling their bookings too).
          3. Deletes the hospital record.
          4. Deletes the linked Django User.
 
        Everything runs in a single transaction so it either all succeeds or
        all rolls back.
        """
        from django.contrib.auth import get_user_model
        from bookings.models import Booking
 
        User = get_user_model()
 
        deleted_hospitals = []
        errors = []
 
        for hospital in queryset:
            try:
                with transaction.atomic():
                    hospital_name = hospital.name
 
                    # Step 1 — cancel all active bookings for this hospital
                    cancelled = Booking.objects.filter(
                        hospital=hospital,
                        status__in=['waiting', 'in_progress']
                    ).update(status='cancelled')
 
                    # Step 2 — delete all bookings (now none are PROTECT-blocked)
                    Booking.objects.filter(hospital=hospital).delete()
 
                    # Step 3 — delete all doctors (bookings already gone)
                    hospital.doctors.all().delete()
 
                    # Step 4 — delete linked user
                    User.objects.filter(mobile=hospital.mobile).delete()
 
                    # Step 5 — delete the hospital
                    hospital.delete()
 
                    deleted_hospitals.append(hospital_name)
 
            except Exception as exc:
                errors.append(f'{hospital.name}: {exc}')
 
        if deleted_hospitals:
            self.message_user(
                request,
                f'Successfully deleted {len(deleted_hospitals)} hospital(s): '
                f'{", ".join(deleted_hospitals)}. '
                f'All associated bookings were cancelled and removed.',
                messages.SUCCESS
            )
 
        for err in errors:
            self.message_user(request, f'Error — {err}', messages.ERROR)
 
    # ── Override the default "delete_selected" to prevent the ugly error ───────
 
    def get_actions(self, request):
        actions = super().get_actions(request)
        # Remove the default "delete_selected" — users must use safe_delete instead
        if 'delete_selected' in actions:
            del actions['delete_selected']
        return actions
 
    # ── Prevent single-object delete from the change view too ─────────────────
 
    def delete_model(self, request, obj):
        """
        Called when an admin clicks Delete on the hospital detail page.
        We override it to do the same safe cascade instead of hitting PROTECT.
        """
        from django.contrib.auth import get_user_model
        from bookings.models import Booking
 
        User = get_user_model()
 
        with transaction.atomic():
            # Cancel + delete bookings
            Booking.objects.filter(
                hospital=obj,
                status__in=['waiting', 'in_progress']
            ).update(status='cancelled')
            Booking.objects.filter(hospital=obj).delete()
 
            # Delete doctors
            obj.doctors.all().delete()
 
            # Delete user
            User.objects.filter(mobile=obj.mobile).delete()
 
            # Delete hospital
            obj.delete()
 