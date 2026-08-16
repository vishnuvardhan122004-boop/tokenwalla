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
    fieldsets     = UserAdmin.fieldsets + (
        ('TokenWalla', {'fields': ('mobile', 'role', 'status', 'whatsapp_opt_in')}),
    )
