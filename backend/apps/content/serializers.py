from rest_framework import serializers
from .models import Qualification, Paper, Module, Chapter, Topic, Question


class QualificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Qualification
        fields = ["id", "name"]


class PaperSerializer(serializers.ModelSerializer):
    class Meta:
        model = Paper
        fields = ["id", "qualification", "name"]


class ModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ["id", "paper", "name"]


class ChapterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chapter
        fields = ["id", "module", "name"]


class TopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Topic
        fields = ["id", "chapter", "name"]


class QuestionSerializer(serializers.ModelSerializer):
    qualification_name = serializers.CharField(source="qualification.name", read_only=True)
    paper_name = serializers.CharField(source="paper.name", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)
    chapter_name = serializers.CharField(source="chapter.name", read_only=True)
    topic_name = serializers.CharField(source="topic.name", read_only=True)

    class Meta:
        model = Question
        fields = [
            "id",
            "qualification",
            "qualification_name",
            "paper",
            "paper_name",
            "module",
            "module_name",
            "chapter",
            "chapter_name",
            "topic",
            "topic_name",
            "qtype",
            "difficulty",
            "skill_type",
            "text",
            "explanation",
            "media_url",
            "marks",
            "professional_marks",
            "choices",
            "correct_answer",
            "is_active",
            "created_at",
        ]
