from django.db import models
from django.conf import settings
from apps.content.models import Question, Qualification, Paper, Module, Chapter, Topic


class TestTemplate(models.Model):
    class Mode(models.TextChoices):
        EXAM = "EXAM", "Exam"
        PRACTICE = "PRACTICE", "Practice"

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    mode = models.CharField(max_length=10, choices=Mode.choices, default=Mode.EXAM)

    qualification = models.ForeignKey(Qualification, on_delete=models.PROTECT)
    paper = models.ForeignKey(Paper, on_delete=models.PROTECT)

    # JSON config: {"duration_minutes":60, "randomize":true, "difficulty_mix":{"EASY":40,"MEDIUM":40,"HARD":20}, "negative_mark":0.25}
    config = models.JSONField(default=dict)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_tests")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.mode})"


class ScheduledTest(models.Model):
    template = models.ForeignKey(TestTemplate, on_delete=models.CASCADE, related_name="schedules")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    batches = models.ManyToManyField('accounts.Batch', blank=True)
    students = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True)
    # Optional config overrides for this schedule (e.g., include_topics)
    override_config = models.JSONField(default=dict, blank=True)
    # Optional list of allowed IPs (exact string match or CIDR in future)
    ip_allowlist = models.JSONField(default=list, blank=True)

    def __str__(self):
        return f"Schedule: {self.template.name}"


class Attempt(models.Model):
    class Status(models.TextChoices):
        STARTED = "STARTED", "Started"
        SUBMITTED = "SUBMITTED", "Submitted"
        EXPIRED = "EXPIRED", "Expired"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    template = models.ForeignKey(TestTemplate, on_delete=models.PROTECT)
    schedule = models.ForeignKey(ScheduledTest, null=True, blank=True, on_delete=models.SET_NULL)

    questions = models.ManyToManyField(Question, through="AttemptItem")

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.STARTED)
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    score = models.FloatField(default=0)
    total_marks = models.FloatField(default=0)
    accuracy = models.FloatField(default=0)

    # Pause/resume tracking (practice mode):
    paused_at = models.DateTimeField(null=True, blank=True)
    pause_total_sec = models.IntegerField(default=0)

    client_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    device_hash = models.CharField(max_length=64, blank=True)
    security_flags = models.IntegerField(default=0)
    flagged = models.BooleanField(default=False)

    def __str__(self):
        return f"Attempt {self.id} - {self.user} - {self.template.name}"


class AttemptItem(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="items")
    question = models.ForeignKey(Question, on_delete=models.PROTECT)

    response = models.JSONField(default=dict, blank=True)
    is_correct = models.BooleanField(default=False)
    time_spent_sec = models.IntegerField(default=0)
    flagged = models.BooleanField(default=False)
    bookmarked = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    # Manual grading fields
    manual_score = models.FloatField(null=True, blank=True)
    reviewer_notes = models.TextField(blank=True)

    def __str__(self):
        return f"AttemptItem {self.attempt_id}:{self.question_id}"


class ResumeEvent(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="resume_events")
    event = models.CharField(max_length=64)  # BLUR, FOCUS, VISIBILITY_HIDDEN, VISIBILITY_VISIBLE, DEVTOOLS_OPEN, MULTITAB, OFFLINE, ONLINE, COPY, PASTE, CONTEXT
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
