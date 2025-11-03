from rest_framework import serializers
from .models import TestTemplate, ScheduledTest, Attempt, AttemptItem
from apps.content.serializers import QuestionSerializer
from apps.content.models import Question


class TestTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestTemplate
        fields = ["id", "name", "description", "mode", "qualification", "paper", "config", "created_by", "created_at"]
        read_only_fields = ["created_by", "created_at"]


class ScheduledTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduledTest
        fields = ["id", "template", "starts_at", "ends_at", "batches", "students", "override_config"]

    def validate(self, attrs):
        starts_at = attrs.get("starts_at") or getattr(self.instance, "starts_at", None)
        ends_at = attrs.get("ends_at") or getattr(self.instance, "ends_at", None)
        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError({"ends_at": "must be after starts_at"})
        return attrs


class AttemptItemSerializer(serializers.ModelSerializer):
    question = QuestionSerializer(read_only=True)

    class Meta:
        model = AttemptItem
        fields = [
            "id",
            "question",
            "response",
            "is_correct",
            "time_spent_sec",
            "flagged",
            "bookmarked",
            "notes",
            "manual_score",
            "reviewer_notes",
        ]


class AttemptSerializer(serializers.ModelSerializer):
    items = AttemptItemSerializer(many=True, read_only=True)
    mode = serializers.SerializerMethodField()
    template_config = serializers.SerializerMethodField()

    class Meta:
        model = Attempt
        fields = [
            "id",
            "user",
            "template",
            "schedule",
            "status",
            "started_at",
            "submitted_at",
            "score",
            "total_marks",
            "accuracy",
            "security_flags",
            "flagged",
            "mode",
            "template_config",
            "items",
        ]
        read_only_fields = [
            "user",
            "status",
            "started_at",
            "submitted_at",
            "score",
            "total_marks",
            "accuracy",
            "security_flags",
            "flagged",
            "mode",
            "template_config",
        ]

    def get_mode(self, obj):
        try:
            return obj.template.mode
        except Exception:
            return None

    def get_template_config(self, obj):
        try:
            return obj.template.config or {}
        except Exception:
            return {}
