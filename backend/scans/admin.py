from django.contrib import admin

from .models import Scan


@admin.register(Scan)
class ScanAdmin(admin.ModelAdmin):
    list_display  = ('name', 'center', 'modality', 'price', 'available')
    list_filter   = ('modality', 'available', 'payment_collection_mode')
    search_fields = ('name', 'modality', 'keywords', 'center__name')
