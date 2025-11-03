from django.db import models


class Qualification(models.Model):
    name = models.CharField(max_length=120, unique=True)

    def __str__(self):
        return self.name


class Paper(models.Model):
    qualification = models.ForeignKey(Qualification, on_delete=models.CASCADE, related_name="papers")
    name = models.CharField(max_length=120)

    class Meta:
        unique_together = ("qualification", "name")

    def __str__(self):
        return f"{self.qualification} - {self.name}"


class Module(models.Model):
    paper = models.ForeignKey(Paper, on_delete=models.CASCADE, related_name="modules")
    name = models.CharField(max_length=120)

    class Meta:
        unique_together = ("paper", "name")

    def __str__(self):
        return f"{self.paper} - {self.name}"


class Chapter(models.Model):
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="chapters")
    name = models.CharField(max_length=120)

    class Meta:
        unique_together = ("module", "name")

    def __str__(self):
        return f"{self.module} - {self.name}"


class Topic(models.Model):
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name="topics")
    name = models.CharField(max_length=120)

    class Meta:
        unique_together = ("chapter", "name")

    def __str__(self):
        return f"{self.chapter} - {self.name}"


class Question(models.Model):
    class Type(models.TextChoices):
        MCQ_SINGLE = "MCQ_SINGLE", "MCQ (Single)"
        MCQ_MULTI = "MCQ_MULTI", "MCQ (Multiple)"
        TRUE_FALSE = "TRUE_FALSE", "True/False"
        SHORT = "SHORT", "Short Answer"
        LONG = "LONG", "Long/Subjective"

    class Difficulty(models.TextChoices):
        EASY = "EASY", "Easy"
        MEDIUM = "MEDIUM", "Medium"
        HARD = "HARD", "Hard"

    class Skill(models.TextChoices):
        KNOWLEDGE = "KNOWLEDGE", "Knowledge"
        APPLICATION = "APPLICATION", "Application"
        PROFESSIONAL = "PROFESSIONAL", "Professional"

    qualification = models.ForeignKey(Qualification, on_delete=models.PROTECT)
    paper = models.ForeignKey(Paper, on_delete=models.PROTECT)
    module = models.ForeignKey(Module, on_delete=models.PROTECT)
    chapter = models.ForeignKey(Chapter, on_delete=models.PROTECT)
    topic = models.ForeignKey(Topic, on_delete=models.PROTECT)

    qtype = models.CharField(max_length=20, choices=Type.choices)
    difficulty = models.CharField(max_length=10, choices=Difficulty.choices)
    skill_type = models.CharField(max_length=15, choices=Skill.choices)

    text = models.TextField()
    explanation = models.TextField(blank=True)
    media_url = models.URLField(blank=True)
    marks = models.FloatField(default=1.0)
    professional_marks = models.FloatField(default=0.0)

    # Store choices and answers as JSON structures
    choices = models.JSONField(default=list, blank=True)
    correct_answer = models.JSONField(default=dict, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.qtype} - {self.text[:50]}"
