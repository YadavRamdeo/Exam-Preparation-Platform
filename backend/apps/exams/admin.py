from django.contrib import admin
from .models import TestTemplate, ScheduledTest, Attempt, AttemptItem, ResumeEvent


@admin.register(TestTemplate)
class TestTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "mode", "paper", "created_by", "created_at")
    list_filter = ("mode", "paper")


@admin.register(ScheduledTest)
class ScheduledTestAdmin(admin.ModelAdmin):
    list_display = ("template", "starts_at", "ends_at")


class AttemptItemInline(admin.TabularInline):
    model = AttemptItem
    extra = 0


@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "template", "status", "score", "accuracy", "started_at")
    list_filter = ("status", "template")
    inlines = [AttemptItemInline]


@admin.register(ResumeEvent)
class ResumeEventAdmin(admin.ModelAdmin):
    list_display = ("attempt", "event", "created_at")
