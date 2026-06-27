from django.contrib import admin
from .models import WhatsAppLog


@admin.register(WhatsAppLog)
class WhatsAppLogAdmin(admin.ModelAdmin):
    list_display  = ('booking', 'event_type', 'status', 'created')
    list_filter   = ('event_type', 'status')
    search_fields = ('booking__token', 'wa_message_id')
