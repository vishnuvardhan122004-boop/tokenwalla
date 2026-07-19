from django.contrib import admin
from .models import DeviceToken, WhatsAppLog


@admin.register(WhatsAppLog)
class WhatsAppLogAdmin(admin.ModelAdmin):
    list_display  = ('booking', 'event_type', 'status', 'created')
    list_filter   = ('event_type', 'status')
    search_fields = ('booking__token', 'wa_message_id')


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    list_display  = ('user', 'role', 'expo_token', 'updated')
    list_filter   = ('role',)
    search_fields = ('user__username', 'user__mobile', 'expo_token')
