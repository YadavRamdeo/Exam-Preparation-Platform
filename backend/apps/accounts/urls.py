from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import RegisterView, MeView, BatchViewSet, UserViewSet, TwoFactorTokenView, Toggle2FAView, MarkAttendanceView

router = DefaultRouter()
router.register(r"batches", BatchViewSet)
router.register(r"users", UserViewSet)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("token/", TwoFactorTokenView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("2fa/toggle/", Toggle2FAView.as_view(), name="toggle_2fa"),
    path("attendance/mark/", MarkAttendanceView.as_view(), name="attendance_mark"),
]

urlpatterns += router.urls
