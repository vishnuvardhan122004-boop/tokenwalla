from django.contrib import admin

from .models import Scan, ScanReport


@admin.register(Scan)
class ScanAdmin(admin.ModelAdmin):
    list_display  = ('name', 'center', 'modality', 'price', 'available')
    list_filter   = ('modality', 'available', 'payment_collection_mode')
    search_fields = ('name', 'modality', 'keywords', 'center__name')


@admin.register(ScanReport)
class ScanReportAdmin(admin.ModelAdmin):
    list_display  = ('display_title', 'booking', 'uploaded_by', 'notified_at', 'created')
    search_fields = ('title', 'booking__token')
    readonly_fields = ('created',)
