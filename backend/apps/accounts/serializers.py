from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Batch

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    batch_ids = serializers.PrimaryKeyRelatedField(source='batches', many=True, read_only=True)
    child_ids = serializers.PrimaryKeyRelatedField(source='parent_of', many=True, read_only=True)
    is_superuser = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role", "is_superuser", "two_factor_enabled", "batch_ids", "child_ids"]


class BatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Batch
        fields = ["id", "name", "description"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["username", "email", "password", "role"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
