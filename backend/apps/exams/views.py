from django.utils import timezone
from django.db import transaction
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import TestTemplate, ScheduledTest, Attempt, AttemptItem, ResumeEvent
from .serializers import TestTemplateSerializer, ScheduledTestSerializer, AttemptSerializer
from apps.accounts.permissions import IsAdmin, IsTeacher, IsStudent
from .utils import pick_questions, score_question


class TestTemplateViewSet(viewsets.ModelViewSet):
    queryset = TestTemplate.objects.all().order_by("-created_at")
    serializer_class = TestTemplateSerializer

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [(IsAdmin | IsTeacher)()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ScheduledTestViewSet(viewsets.ModelViewSet):
    queryset = ScheduledTest.objects.all().order_by("-starts_at")
    serializer_class = ScheduledTestSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        template_id = self.request.query_params.get("template")
        batch_id = self.request.query_params.get("batch")
        if template_id:
            qs = qs.filter(template_id=template_id)
        if batch_id:
            qs = qs.filter(batches__id=batch_id)
        if self.request.user.role == "TEACHER":
            qs = qs.filter(template__created_by=self.request.user)
        return qs

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy", "notify"]:
            return [(IsAdmin | IsTeacher)()]
        return [permissions.IsAuthenticated()]

    @action(detail=True, methods=["get"], url_path="insights")
    def insights(self, request, pk=None):
        from django.contrib.auth import get_user_model
        schedule = self.get_object()
        User = get_user_model()
        batch_students = User.objects.filter(batches__in=schedule.batches.all(), role="STUDENT").distinct()
        direct_students = schedule.students.filter(role="STUDENT").distinct()
        assigned = User.objects.filter(id__in=list(batch_students.values_list('id', flat=True)) + list(direct_students.values_list('id', flat=True))).distinct()
        attempts = Attempt.objects.filter(schedule=schedule).select_related("user")
        started_ids = attempts.values_list("user_id", flat=True).distinct()
        submitted_ids = attempts.filter(status=Attempt.Status.SUBMITTED).values_list("user_id", flat=True).distinct()
        pending = assigned.exclude(id__in=submitted_ids)
        # time stats
        items = AttemptItem.objects.filter(attempt__in=attempts)
        from django.db.models import Avg, Count
        time_stats = items.aggregate(avg_time=Avg("time_spent_sec"), total_items=Count("id"))
        weak_topics = (
            items.values("question__topic__name")
            .annotate(acc=Avg("is_correct"), total=Count("id"))
            .order_by("acc")[:10]
        )
        return Response({
            "assigned": list(assigned.values("id", "username")),
            "started": list(set(started_ids)),
            "submitted": list(set(submitted_ids)),
            "pending": list(pending.values("id", "username")),
            "time_stats": time_stats,
            "weak_topics": list(weak_topics),
        })

    @action(detail=True, methods=["post"], url_path="notify")
    def notify(self, request, pk=None):
        """
        Send feedback or resources to assigned or selected students.
        Body: { message: str, resources?: [url], user_ids?: [int], pending_only?: bool }
        """
        from django.core.mail import send_mail
        schedule = self.get_object()
        user_ids = request.data.get("user_ids") or []
        pending_only = bool(request.data.get("pending_only", False))
        message = (request.data.get("message") or "").strip()
        resources = request.data.get("resources") or []
        # compute recipients
        from django.contrib.auth import get_user_model
        User = get_user_model()
        batch_students = User.objects.filter(batches__in=schedule.batches.all(), role="STUDENT").distinct()
        direct_students = schedule.students.filter(role="STUDENT").distinct()
        assigned = User.objects.filter(id__in=list(batch_students.values_list('id', flat=True)) + list(direct_students.values_list('id', flat=True))).distinct()
        if user_ids:
            assigned = assigned.filter(id__in=user_ids)
        if pending_only:
            submitted_ids = set(Attempt.objects.filter(schedule=schedule, status=Attempt.Status.SUBMITTED).values_list("user_id", flat=True))
            assigned = assigned.exclude(id__in=submitted_ids)
        links = "\n".join([str(u) for u in resources]) if resources else ""
        body = (message + ("\n\nResources:\n" + links if links else "")).strip() or "Instructor feedback"
        recipients = [u.email for u in assigned if u.email]
        if not recipients:
            return Response({"detail": "no recipients (ensure users have email)"}, status=400)
        try:
            send_mail(subject=f"Update: {schedule.template.name}", message=body, from_email=None, recipient_list=recipients, fail_silently=False)
            return Response({"ok": True, "sent": len(recipients)})
        except Exception as e:
            return Response({"detail": str(e)}, status=500)


class AttemptViewSet(viewsets.ModelViewSet):
    queryset = Attempt.objects.all().order_by("-started_at")
    serializer_class = AttemptSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        # optional filters for list view
        template_id = self.request.query_params.get("template")
        status_f = self.request.query_params.get("status")
        if template_id:
            qs = qs.filter(template_id=template_id)
        if status_f:
            qs = qs.filter(status=status_f)
        if self.request.user.role == "ADMIN" or self.request.user.role == "TEACHER":
            return qs
        return qs.filter(user=self.request.user)

    def get_permissions(self):
        if self.action in ["create", "start", "answer", "submit", "resume_event", "bookmark", "note"]:
            return [IsStudent()]
        return [permissions.IsAuthenticated()]

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        import csv
        from django.http import StreamingHttpResponse

        qs = self.get_queryset()
        # Teachers can export their own templates only
        if request.user.role == "TEACHER":
            qs = qs.filter(template__created_by=request.user)

        def row_iter():
            header = [
                "attempt_id",
                "user_id",
                "template",
                "status",
                "started_at",
                "submitted_at",
                "score",
                "total_marks",
                "accuracy",
                "items",
            ]
            yield ",".join(header) + "\n"
            for a in qs.select_related("template", "user"):
                yield ",".join([
                    str(a.id),
                    str(a.user_id),
                    a.template.name,
                    a.status,
                    a.started_at.isoformat() if a.started_at else "",
                    a.submitted_at.isoformat() if a.submitted_at else "",
                    f"{a.score}",
                    f"{a.total_marks}",
                    f"{a.accuracy}",
                    str(a.items.count()),
                ]) + "\n"

        resp = StreamingHttpResponse(row_iter(), content_type="text/csv")
        resp["Content-Disposition"] = "attachment; filename=attempts_export.csv"
        return resp

    @action(detail=False, methods=["get"], url_path="export-json")
    def export_json(self, request):
        qs = self.get_queryset()
        if request.user.role == "TEACHER":
            qs = qs.filter(template__created_by=request.user)
        out = []
        for a in qs.select_related("template", "user").prefetch_related("items__question"):
            out.append({
                "id": a.id,
                "user": a.user.username,
                "template": a.template.name,
                "status": a.status,
                "started_at": a.started_at.isoformat() if a.started_at else None,
                "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
                "score": a.score,
                "total_marks": a.total_marks,
                "accuracy": a.accuracy,
                "items": [
                    {
                        "id": it.id,
                        "question_id": it.question_id,
                        "qtype": it.question.qtype,
                        "topic": getattr(it.question, 'topic', None).name if getattr(it.question, 'topic', None) else None,
                        "marks": it.question.marks,
                        "time_spent_sec": it.time_spent_sec,
                        "is_correct": it.is_correct,
                        "manual_score": it.manual_score,
                        "reviewer_notes": it.reviewer_notes,
                    }
                    for it in a.items.all()
                ],
            })
        from rest_framework.response import Response
        return Response(out)

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def start(self, request):
        template_id = request.data.get("template_id")
        schedule_id = request.data.get("schedule_id")
        device_hash = (request.data.get("device_hash") or "")[:64]
        if not template_id:
            return Response({"detail": "template_id is required"}, status=400)
        try:
            template = TestTemplate.objects.get(id=template_id)
        except TestTemplate.DoesNotExist:
            return Response({"detail": "template not found"}, status=404)

        # Enforce single active attempt per user+template
        existing = Attempt.objects.filter(user=request.user, template_id=template_id, status=Attempt.Status.STARTED).first()
        if existing:
            # If device lock set, ensure it matches
            if existing.device_hash and device_hash and existing.device_hash != device_hash:
                return Response({"detail": "device mismatch for active attempt"}, status=403)
            return Response(AttemptSerializer(existing).data)

        config = template.config or {}
        override = request.data.get("override_config") or {}
        schedule = ScheduledTest.objects.filter(id=schedule_id).first() if schedule_id else None
        # Check schedule window and IP allowlist
        now = timezone.now()
        if schedule:
            if schedule.starts_at and now < schedule.starts_at:
                return Response({"detail": "test not started yet"}, status=403)
            if schedule.ends_at and now > schedule.ends_at:
                return Response({"detail": "test window ended"}, status=403)
            ip = request.META.get("REMOTE_ADDR")
            if schedule.ip_allowlist:
                if ip not in schedule.ip_allowlist:
                    return Response({"detail": "ip not allowed"}, status=403)
        # merge: template <- schedule.override_config <- request.override (request wins)
        if schedule and isinstance(schedule.override_config, dict):
            config.update(schedule.override_config)
        if isinstance(override, dict):
            config.update(override)
        questions = pick_questions(template.qualification_id, template.paper_id, config, user=request.user)

        attempt = Attempt.objects.create(
            user=request.user,
            template=template,
            schedule=schedule,
            client_ip=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            device_hash=device_hash,
        )
        total_marks = 0
        for q in questions:
            AttemptItem.objects.create(attempt=attempt, question=q)
            total_marks += q.marks
        attempt.total_marks = total_marks
        attempt.save()

        return Response(AttemptSerializer(attempt).data)

    @action(detail=True, methods=["post"])
    def answer(self, request, pk=None):
        attempt = self.get_object()
        item_id = request.data.get("item_id")
        response = request.data.get("response", {})
        time_spent_sec = int(request.data.get("time_spent_sec", 0) or 0)

        try:
            item = attempt.items.get(id=item_id)
        except AttemptItem.DoesNotExist:
            return Response({"detail": "item not found"}, status=404)

        item.response = response
        item.time_spent_sec += time_spent_sec

        cfg = attempt.template.config or {}
        negative = float(cfg.get("negative_mark", 0.0))
        partial_multi = bool(cfg.get("partial_multi", False))
        delta, is_correct = score_question(item.question, response, negative, partial_multi)
        item.is_correct = is_correct
        item.save()

        if attempt.template.mode == "PRACTICE":
            return Response({
                "is_correct": is_correct,
                "delta": delta,
                "explanation": (item.question.explanation or ""),
                "media_url": (item.question.media_url or ""),
                "correct_answer": item.question.correct_answer,
            })
        return Response({"status": "saved"})

    @action(detail=True, methods=["post"])
    def bookmark(self, request, pk=None):
        attempt = self.get_object()
        item_id = request.data.get("item_id")
        val = bool(request.data.get("value", True))
        item = attempt.items.filter(id=item_id).first()
        if not item:
            return Response({"detail": "item not found"}, status=404)
        item.bookmarked = val
        item.save()
        return Response({"bookmarked": item.bookmarked})

    @action(detail=True, methods=["post"])
    def note(self, request, pk=None):
        attempt = self.get_object()
        item_id = request.data.get("item_id")
        text = request.data.get("text", "")
        item = attempt.items.filter(id=item_id).first()
        if not item:
            return Response({"detail": "item not found"}, status=404)
        item.notes = text
        item.save()
        return Response({"notes": item.notes})

    @action(detail=True, methods=["post"], url_path="run-code")
    def run_code(self, request, pk=None):
        """
        Lightweight evaluator for coding questions (LONG). Executes user code in a restricted env
        and validates against built-in tests for the question. Currently supports the 'Valid Anagram' prompt.
        """
        attempt = self.get_object()
        item_id = request.data.get("item_id")
        code = request.data.get("code", "")
        try:
            item = attempt.items.get(id=item_id)
        except AttemptItem.DoesNotExist:
            return Response({"detail": "item not found"}, status=404)
        if item.question.qtype != "LONG":
            return Response({"detail": "not a coding question"}, status=400)

        # Prepare tests for the known coding prompt (Valid Anagram)
        # Exact 10 cases the candidate sees in the UI
        tests = [
            ("listen", "silent", True),
            ("anagram", "nagaram", True),
            ("rat", "car", False),
            ("aacc", "ccac", False),
            ("night", "thing", True),
            ("abcd", "dcba", True),
            ("hello", "olleh", True),
            ("python", "typhon", True),
            ("fluster", "restful", True),
            ("apple", "papel", True),
        ]

        # Execute user code in a very restricted namespace (not security-hardened for untrusted users)
        import builtins, types, traceback
        safe_builtins = {
            "len": len, "range": range, "sorted": sorted, "enumerate": enumerate,
            "zip": zip, "map": map, "filter": filter, "list": list, "dict": dict,
            "set": set, "tuple": tuple, "all": all, "any": any, "sum": sum, "abs": abs,
            "ord": ord, "chr": chr
        }
        global_ns = {"__builtins__": safe_builtins}
        local_ns = {}

        try:
            exec(code, global_ns, local_ns)
        except Exception:
            return Response({"passed": False, "error": "Compilation error", "trace": traceback.format_exc(limit=2)})

        # Locate Solution.isAnagram
        try:
            Solution = local_ns.get("Solution") or global_ns.get("Solution")
            if Solution is None:
                return Response({"passed": False, "error": "Class Solution not found"})
            sol = Solution()
            func = getattr(sol, "isAnagram")
        except Exception:
            return Response({"passed": False, "error": "isAnagram method not found"})

        # Run tests
        results = []
        passed_all = True
        try:
            for i, (s, t, expect) in enumerate(tests, 1):
                got = bool(func(s, t))
                ok = (got is expect)
                results.append({"case": i, "input": [s, t], "expected": expect, "got": got, "ok": ok})
                if not ok:
                    passed_all = False
        except Exception:
            return Response({"passed": False, "error": "Runtime error", "trace": traceback.format_exc(limit=2)})

        # Save code into item.response for later review
        item.response = {"text": code, "tests_passed": passed_all}
        item.save(update_fields=["response"])

        return Response({"passed": passed_all, "results": results})

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def submit(self, request, pk=None):
        attempt = self.get_object()
        total = 0.0
        correct_cnt = 0
        cfg = attempt.template.config or {}
        for item in attempt.items.select_related("question"):
            negative = float(cfg.get("negative_mark", 0.0))
            partial_multi = bool(cfg.get("partial_multi", False))
            delta, is_correct = score_question(item.question, item.response or {}, negative, partial_multi)
            total += max(0.0, delta) if attempt.template.mode == "EXAM" else (delta if is_correct else 0)
            if is_correct:
                correct_cnt += 1
            item.is_correct = is_correct
            item.save()
        attempt.score = total
        attempt.accuracy = (correct_cnt / attempt.items.count()) * 100 if attempt.items.exists() else 0
        attempt.submitted_at = timezone.now()
        attempt.status = Attempt.Status.SUBMITTED
        attempt.save()
        return Response(AttemptSerializer(attempt).data)

    @action(detail=True, methods=["post"], url_path="resume-event")
    def resume_event(self, request, pk=None):
        attempt = self.get_object()
        event = request.data.get("event")
        meta = request.data.get("meta") or {}
        if event:
            ResumeEvent.objects.create(attempt=attempt, event=event, meta=meta if isinstance(meta, dict) else {})
            # Increment security flags for risky events
            if event in {"BLUR", "VISIBILITY_HIDDEN", "OFFLINE", "DEVTOOLS_OPEN", "COPY", "PASTE", "CONTEXT", "MULTITAB"}:
                attempt.security_flags = (attempt.security_flags or 0) + 1
                if attempt.security_flags >= 3:
                    attempt.flagged = True
                attempt.save(update_fields=["security_flags", "flagged"])
        return Response({"ok": True, "security_flags": attempt.security_flags, "flagged": attempt.flagged})

    @action(detail=True, methods=["post"], url_path="proctoring-token")
    def proctoring_token(self, request, pk=None):
        """
        Optional: fetch a webcam proctoring session token from external API.
        Set PROCTORING_API_URL and PROCTORING_API_KEY in settings to enable.
        """
        from django.conf import settings
        import json, urllib.request
        if not getattr(settings, 'PROCTORING_API_URL', ''):
            # feature disabled -> return a stub for local testing
            return Response({"token": None, "enabled": False})
        url = settings.PROCTORING_API_URL.rstrip('/') + '/sessions'
        payload = json.dumps({
            "attempt_id": int(pk),
            "user_id": request.user.id,
            "name": request.user.get_username(),
        }).encode('utf-8')
        req = urllib.request.Request(url, data=payload, method='POST')
        req.add_header('Content-Type', 'application/json')
        if getattr(settings, 'PROCTORING_API_KEY', ''):
            req.add_header('Authorization', f"Bearer {settings.PROCTORING_API_KEY}")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                return Response({"token": data.get('token'), "enabled": True})
        except Exception as e:
            return Response({"detail": f"proctoring error: {e}"}, status=502)

    @action(detail=True, methods=["post"], url_path="pause")
    def pause(self, request, pk=None):
        attempt = self.get_object()
        from django.utils import timezone as tz
        if attempt.paused_at is None:
            attempt.paused_at = tz.now()
            attempt.save(update_fields=["paused_at"])
        return Response({"paused": True, "paused_at": attempt.paused_at})

    @action(detail=True, methods=["post"], url_path="resume")
    def resume(self, request, pk=None):
        attempt = self.get_object()
        from django.utils import timezone as tz
        if attempt.paused_at is not None:
            delta = tz.now() - attempt.paused_at
            attempt.pause_total_sec = (attempt.pause_total_sec or 0) + int(delta.total_seconds())
            attempt.paused_at = None
            attempt.save(update_fields=["paused_at", "pause_total_sec"])
        return Response({"paused": False, "pause_total_sec": attempt.pause_total_sec})

    @action(detail=True, methods=["post"], url_path="grade-item")
    def grade_item(self, request, pk=None):
        attempt = self.get_object()
        item_id = request.data.get("item_id")
        score = request.data.get("score")
        notes = request.data.get("notes", "")
        item = attempt.items.filter(id=item_id).first()
        if not item:
            return Response({"detail": "item not found"}, status=404)
        try:
            score = float(score)
        except (TypeError, ValueError):
            return Response({"detail": "invalid score"}, status=400)
        item.manual_score = score
        item.reviewer_notes = notes
        # Treat manual > 0 as correct for accuracy purposes
        item.is_correct = score > 0
        item.save()
        return Response({"manual_score": item.manual_score, "reviewer_notes": item.reviewer_notes})

    @action(detail=True, methods=["post"], url_path="finalize-grades")
    @transaction.atomic
    def finalize_grades(self, request, pk=None):
        attempt = self.get_object()
        total = 0.0
        correct_cnt = 0
        cfg = attempt.template.config or {}
        for item in attempt.items.select_related("question"):
            if item.manual_score is not None:
                total += max(0.0, float(item.manual_score))
                if (item.manual_score or 0) > 0:
                    correct_cnt += 1
            else:
                negative = float(cfg.get("negative_mark", 0.0))
                partial_multi = bool(cfg.get("partial_multi", False))
                delta, is_correct = score_question(item.question, item.response or {}, negative, partial_multi)
                total += max(0.0, delta) if attempt.template.mode == "EXAM" else (delta if is_correct else 0)
                if is_correct:
                    correct_cnt += 1
                item.is_correct = is_correct
                item.save()
        attempt.score = total
        attempt.accuracy = (correct_cnt / attempt.items.count()) * 100 if attempt.items.exists() else 0
        attempt.save()
        return Response(AttemptSerializer(attempt).data)
