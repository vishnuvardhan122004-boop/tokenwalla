from django.contrib import admin
from .models import Booking

@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display  = ('token', 'user', 'doctor', 'hospital', 'date', 'slot', 'status', 'amount')
    list_filter   = ('status', 'date')
    search_fields = ('token', 'user__username', 'doctor__name')
