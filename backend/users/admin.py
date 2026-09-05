from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    """`whatsapp_opt_in` is surfaced here because nothing else can change it back.

    The website has a patient-facing opt-out toggle (MyBookings.js → PATCH
    /auth/me/whatsapp-opt-in/), but the flag appeared in no fieldset, no column
    and no filter — so once a patient switched it off, staff could neither see
    that nor undo it, and every WhatsApp to them silently stopped. The senders
    return before writing a WhatsAppLog row in that case, so it does not even
    leave a failed-send trail. Diagnosed from a live report on 2026-08-17.

    Editable from the list so a batch can be corrected in one save, and
    filterable so "who is opted out?" is answerable at all.
    """
    list_display  = ('username', 'mobile', 'role', 'status', 'whatsapp_opt_in', 'date_joined')
    list_filter   = ('role', 'status', 'whatsapp_opt_in')
    list_editable = ('whatsapp_opt_in',)
    search_fields = ('username', 'mobile')
    # `last_name` is NOT a surname here — for a hospital account it holds the
    # hospital id, and EVERY tenancy check in the backend resolves the caller's
    # hospital by parsing it (permissions.IsDoctorOwnerHospitalOrAdmin,
    # bookings._get_user_hospital_id, scans._may_see_report, notifications.push
    # routing, and six others). Django's UserAdmin.fieldsets puts it on the
    # change form as a plain "Last name" text box, so an admin tidying a record
    # could type a surname there — silently 403ing that hospital out of its own
    # queue — or mistype the number and hand the account another hospital's
    # patient names, mobiles and scan reports.
    #
    # Shown (it is needed to diagnose exactly that) but not typeable.
    fieldsets     = tuple(
        (name, {**opts, 'fields': tuple(f for f in opts['fields'] if f != 'last_name')})
        for name, opts in UserAdmin.fieldsets
    ) + (
        ('TokenWalla', {'fields': ('mobile', 'role', 'status', 'whatsapp_opt_in',
                                   'last_name')}),
    )
    readonly_fields = ('last_name',)

    def has_delete_permission(self, request, obj=None):
        """Refuse to delete a patient who has payment history.

        `Booking.user` is CASCADE while `Booking.doctor` and `Booking.hospital`
        are PROTECT, so deleting an account here silently takes that patient's
        Payment, Refund and ReschedulePayment rows with it — and the GST charged
        on them. Exactly the failure the force-delete endpoints were guarded
        against (payments.models.financial_rows_for); this is the same hole with
        an admin button in front of it instead of an API call.

        Blocking rather than anonymising is the deliberate choice: it needs no
        migration and is reversible. If a deletion request ever has to be
        honoured, the answer is a nullable `Booking.user` with SET_NULL so the
        money rows outlive the account — see ROADMAP.
        """
        if obj is None:
            return super().has_delete_permission(request, obj)
        from payments.models import financial_rows_for
        if financial_rows_for(user=obj):
            return False
        return super().has_delete_permission(request, obj)
