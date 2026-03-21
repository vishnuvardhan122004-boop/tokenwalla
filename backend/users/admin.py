from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display  = ('username', 'mobile', 'role', 'status', 'date_joined')
    list_filter   = ('role', 'status')
    search_fields = ('username', 'mobile')
    fieldsets     = UserAdmin.fieldsets + (
        ('TokenWalla', {'fields': ('mobile', 'role', 'status')}),
    )
