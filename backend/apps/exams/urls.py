from rest_framework.routers import DefaultRouter
from .views import TestTemplateViewSet, ScheduledTestViewSet, AttemptViewSet

router = DefaultRouter()
router.register(r"templates", TestTemplateViewSet)
router.register(r"schedules", ScheduledTestViewSet)
router.register(r"attempts", AttemptViewSet)

urlpatterns = router.urls
