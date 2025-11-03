from rest_framework import generics, permissions, viewsets, status
from rest_framework.decorators import action
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.response import Response
from django.contrib.auth import get_user_model, authenticate
from django.utils import timezone
from datetime import timedelta
from uuid import uuid4
from django.core.mail import send_mail
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import RegisterSerializer, UserSerializer, BatchSerializer
from .models import Batch, OneTimeCode, Attendance
from .permissions import IsAdmin, IsTeacher

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class TwoFactorTokenView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # Accept username or email for login
        username = (request.data.get("username") or "").strip()
        email = (request.data.get("email") or "").strip()
        login_id = (request.data.get("login") or username or email).strip()
        password = request.data.get("password")
        otp = request.data.get("otp")
        challenge_id = request.data.get("challenge_id")

        user = None
        # If login looks like an email, try to resolve username by email first
        if login_id and "@" in login_id:
            try:
                user = User.objects.get(email__iexact=login_id)
                # authenticate with resolved username
                user = authenticate(request, username=user.username, password=password)
            except User.DoesNotExist:
                user = None
        else:
            # Try case-insensitive username authentication
            if login_id:
                try:
                    u = User.objects.get(username__iexact=login_id)
                    user = authenticate(request, username=u.username, password=password)
                except User.DoesNotExist:
                    user = authenticate(request, username=login_id, password=password)

        if not user:
            return Response({"detail": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.two_factor_enabled:
            refresh = RefreshToken.for_user(user)
            # record login timestamp
            try:
                from django.utils import timezone as tz
                user.last_login = tz.now()
                user.save(update_fields=["last_login"])
            except Exception:
                pass
            return Response({
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "role": user.role,
                "is_superuser": bool(getattr(user, "is_superuser", False)),
            })

        # 2FA enabled flow
        if otp and challenge_id:
            otc = OneTimeCode.objects.filter(user=user, challenge_id=challenge_id, is_used=False).order_by('-created_at').first()
            if not otc or otc.expires_at < timezone.now():
                return Response({"detail": "OTP expired or invalid"}, status=400)
            otc.attempt_count += 1
            if otc.code == str(otp).strip():
                otc.is_used = True
                otc.save()
                refresh = RefreshToken.for_user(user)
                try:
                    from django.utils import timezone as tz
                    user.last_login = tz.now()
                    user.save(update_fields=["last_login"])
                except Exception:
                    pass
                return Response({
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                    "role": user.role,
                    "is_superuser": bool(getattr(user, "is_superuser", False)),
                })
            otc.save()
            return Response({"detail": "Invalid OTP"}, status=400)

        # generate and send OTP
        if not user.email:
            return Response({"detail": "Email not set for user"}, status=400)
        code = f"{__import__('random').randint(100000, 999999)}"
        otc = OneTimeCode.objects.create(
            user=user,
            challenge_id=str(uuid4()),
            code=code,
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        try:
            send_mail(
                subject="Your FinTram Exam OTP",
                message=f"Your OTP is {code}. It expires in 10 minutes.",
                from_email=None,
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception:
            pass
        return Response({"two_factor_required": True, "challenge_id": otc.challenge_id})


class Toggle2FAView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        enable = bool(request.data.get("enable", True))
        request.user.two_factor_enabled = enable
        request.user.save(update_fields=["two_factor_enabled"])
        return Response({"two_factor_enabled": request.user.two_factor_enabled})


class MarkAttendanceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from django.utils import timezone
        today = timezone.now().date()
        Attendance.objects.update_or_create(user=request.user, date=today, defaults={"present": True})
        return Response({"ok": True, "date": today.isoformat()})


class BatchViewSet(viewsets.ModelViewSet):
    queryset = Batch.objects.all().order_by("name")
    serializer_class = BatchSerializer

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAdmin()]
        return [permissions.IsAuthenticated()]


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("username")
    serializer_class = UserSerializer

    def get_permissions(self):
        # Admins and teachers can view lists for assignment
        if self.action in ["list", "retrieve"]:
            return [(IsAdmin | IsTeacher)()]
        if self.action in ["update", "partial_update", "destroy", "set_role", "assign_batches"]:
            return [IsAdmin()]
        return [permissions.IsAuthenticated()]

    @action(detail=True, methods=["post"])
    def set_role(self, request, pk=None):
        user = self.get_object()
        role = str(request.data.get("role", "")).upper()
        valid = {c for c, _ in User._meta.get_field("role").choices}
        if role not in valid:
            return Response({"detail": f"invalid role: {role}"}, status=400)
        user.role = role
        user.save(update_fields=["role"])
        return Response(UserSerializer(user).data)

    @action(detail=True, methods=["post"], url_path="assign-batches")
    def assign_batches(self, request, pk=None):
        user = self.get_object()
        ids = request.data.get("batch_ids") or []
        try:
            ids = [int(x) for x in ids]
        except Exception:
            return Response({"detail": "batch_ids must be a list of ids"}, status=400)
        qs = Batch.objects.filter(id__in=ids)
        user.batches.set(qs)
        return Response({"user_id": user.id, "batches": list(user.batches.values_list('id', flat=True))})

    @action(detail=True, methods=["post"], url_path="set-children")
    def set_children(self, request, pk=None):
        parent = self.get_object()
        if parent.role != "PARENT" and not getattr(parent, 'is_superuser', False):
            return Response({"detail": "target user is not a parent"}, status=400)
        ids = request.data.get("child_ids") or request.data.get("student_ids") or []
        try:
            ids = [int(x) for x in ids]
        except Exception:
            return Response({"detail": "child_ids must be a list of ids"}, status=400)
        students = User.objects.filter(id__in=ids, role="STUDENT")
        parent.parent_of.set(students)
        return Response({"parent_id": parent.id, "child_ids": list(parent.parent_of.values_list('id', flat=True))})


TokenRefreshView.permission_classes = [permissions.AllowAny]
