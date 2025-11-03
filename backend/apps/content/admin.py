from django.contrib import admin
from .models import Qualification, Paper, Module, Chapter, Topic, Question


@admin.register(Qualification)
class QualificationAdmin(admin.ModelAdmin):
    search_fields = ("name",)


@admin.register(Paper)
class PaperAdmin(admin.ModelAdmin):
    list_display = ("name", "qualification")
    list_filter = ("qualification",)


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ("name", "paper")
    list_filter = ("paper",)


@admin.register(Chapter)
class ChapterAdmin(admin.ModelAdmin):
    list_display = ("name", "module")
    list_filter = ("module",)


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ("name", "chapter")
    list_filter = ("chapter",)


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("id", "qtype", "difficulty", "topic", "marks", "is_active")
    list_filter = ("qtype", "difficulty", "skill_type", "module", "topic")
    search_fields = ("text",)
