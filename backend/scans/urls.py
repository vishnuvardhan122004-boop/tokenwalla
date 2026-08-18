from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ScanViewSet

router = DefaultRouter()
router.register(r'', ScanViewSet, basename='scan')

urlpatterns = [
    path('', include(router.urls)),
]
