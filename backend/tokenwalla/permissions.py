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


class IsDoctorOwnerHospitalOrAdmin(BasePermission):
    """
    Object-level: a hospital account may only mutate doctors that belong to its
    OWN hospital; admins (or staff) may mutate any. The hospital id a user
    manages is stored in User.last_name (set at hospital login/registration).

    View-level has_permission stays True (inherited) so this only narrows the
    per-object check that DRF runs inside get_object() for update/destroy.
    """
    message = 'You can only manage doctors for your own hospital.'

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if getattr(user, 'role', None) == 'admin' or user.is_staff:
            return True
        return (
            getattr(user, 'role', None) == 'hospital' and
            str(getattr(user, 'last_name', '')) == str(obj.hospital_id)
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