"""
tokenwalla/permissions.py
Custom DRF permission classes shared across all apps.
"""
import logging
from rest_framework.permissions import BasePermission

logger = logging.getLogger('tokenwalla')


class IsAdmin(BasePermission):
    """Allows access only to users with role='admin'."""
    message = 'Admin access required.'

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            getattr(request.user, 'role', None) == 'admin'
        )


class IsHospitalStaff(BasePermission):
    """
    Allows access to users with role='hospital' OR role='admin'.
    Admins can view any hospital's data.
    """
    message = 'Hospital staff access required.'

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            getattr(request.user, 'role', None) in ('hospital', 'admin')
        )


class IsOwnerOrAdmin(BasePermission):
    """
    Object-level: user must own the object (obj.user) or be admin.
    """
    message = 'You do not have permission to access this resource.'

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if getattr(request.user, 'role', None) == 'admin':
            return True
        if hasattr(obj, 'user'):
            return obj.user == request.user
        return False