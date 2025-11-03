from django.contrib.auth.models import AbstractUser
from django.db import models


class Batch(models.Model):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        STUDENT = "STUDENT", "Student"
        TEACHER = "TEACHER", "Teacher"
        PARENT = "PARENT", "Parent"

    role = models.CharField(max_length=16, choices=Role.choices, default=Role.STUDENT)
    batches = models.ManyToManyField(Batch, blank=True, related_name="members")
    parent_of = models.ManyToManyField(
        "self", symmetrical=False, related_name="parents", blank=True
    )  # parent -> student link
    two_factor_enabled = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.username} ({self.role})"


class OneTimeCode(models.Model):
    user = models.ForeignKey('User', on_delete=models.CASCADE, related_name='otps')
    challenge_id = models.CharField(max_length=64)
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    attempt_count = models.IntegerField(default=0)


class Attendance(models.Model):
    user = models.ForeignKey('User', on_delete=models.CASCADE, related_name='attendance')
    date = models.DateField()
    present = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "date")

    def __str__(self):
        return f"Attendance for {self.user_id} on {self.date}"
