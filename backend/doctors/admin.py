from django.contrib import admin
from .models import Doctor


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display  = ("name", "specialization", "experience", "mobile", "available", "hospital")
    list_filter   = ("available", "specialization")
    search_fields = ("name", "specialization", "mobile", "hospital__name")