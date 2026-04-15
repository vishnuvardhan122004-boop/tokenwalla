"""
tokenwalla/permissions.py
Custom DRF permission classes shared across apps.
"""
import logging
from rest_framework.permissions import BasePermission

logger = logging.getLogger('tokenwalla')


class IsAdmin(BasePermission):
    """
    Allows access only to users with role='admin'.
    """
    message = 'Admin access required.'

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'admin'
        )


class IsHospitalStaff(BasePermission):
    """
    Allows access only to users with role='hospital'.
    """
    message = 'Hospital staff access required.'

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'hospital'
        )


class IsOwnerOrAdmin(BasePermission):
    """
    Object-level: user must own the object or be admin.
    The view must pass `obj.user` or `obj.hospital`.
    """
    message = 'You do not have permission to access this resource.'

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.role == 'admin':
            return True
        # Booking owner check
        if hasattr(obj, 'user'):
            return obj.user == request.user
        return False