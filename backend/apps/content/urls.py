from rest_framework.routers import DefaultRouter
from .views import (
    QualificationViewSet,
    PaperViewSet,
    ModuleViewSet,
    ChapterViewSet,
    TopicViewSet,
    QuestionViewSet,
)

router = DefaultRouter()
router.register(r"qualifications", QualificationViewSet)
router.register(r"papers", PaperViewSet)
router.register(r"modules", ModuleViewSet)
router.register(r"chapters", ChapterViewSet)
router.register(r"topics", TopicViewSet)
router.register(r"questions", QuestionViewSet)

urlpatterns = router.urls
