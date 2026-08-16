from django.contrib import admin
from .models import DeviceToken, WhatsAppLog


@admin.register(WhatsAppLog)
class WhatsAppLogAdmin(admin.ModelAdmin):
    """The only window into why a WhatsApp message did not arrive.

    `send_template` never raises — it returns a result dict and the senders log
    it here. So a failed send looks exactly like nothing happening unless you
    read `error`, which is why it belongs in the list rather than one click
    down: diagnosing "no WhatsApp arrived" should be one page load, not one
    click per row.
    """
    list_display  = ('booking', 'event_type', 'status', 'short_error', 'created')
    list_filter   = ('event_type', 'status')
    search_fields = ('booking__token', 'wa_message_id', 'error')

    @admin.display(description='Error')
    def short_error(self, obj):
        if not obj.error:
            return '—'
        return obj.error[:90] + '…' if len(obj.error) > 90 else obj.error


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    list_display  = ('user', 'role', 'expo_token', 'updated')
    list_filter   = ('role',)
    search_fields = ('user__username', 'user__mobile', 'expo_token')
