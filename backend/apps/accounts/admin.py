from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Batch


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Role & Batches", {"fields": ("role", "batches", "parent_of")}),
    )
    list_display = ("username", "email", "role", "is_active")
    list_filter = ("role", "is_active")


@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    search_fields = ("name",)
    list_display = ("name",)
