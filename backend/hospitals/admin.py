from django.contrib import admin
from .models import Hospital

@admin.register(Hospital)
class HospitalAdmin(admin.ModelAdmin):
    list_display  = ('name', 'city', 'mobile', 'status', 'created')
    search_fields = ('name', 'city', 'mobile')
    list_filter   = ('status',)
