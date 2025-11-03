from django.db.models import Avg, Count, Sum, Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework import status as drf_status
from rest_framework.permissions import BasePermission
from django.http import StreamingHttpResponse, HttpResponse
from django.utils import timezone
from datetime import timedelta
from apps.exams.models import Attempt, AttemptItem
from apps.content.models import Question
from apps.accounts.permissions import IsParent, IsTeacher
from django.contrib.auth import get_user_model
import csv
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from io import BytesIO


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "ADMIN")


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_progress(request):
    user = request.user
    attempts = Attempt.objects.filter(user=user, status="SUBMITTED")
    summary = attempts.aggregate(
        avg_score=Avg("score"), attempts=Count("id"), avg_accuracy=Avg("accuracy")
    )
    topic_perf = (
        AttemptItem.objects.filter(attempt__in=attempts)
        .values("question__topic__name")
        .annotate(
            total=Count("id"),
            correct=Count("id", filter=Q(is_correct=True)),
        )
        .order_by("-correct")
    )
    return Response({"summary": summary, "topic_performance": list(topic_perf)})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_trends(request):
    user = request.user
    days = int(request.GET.get("days", 60))
    since = timezone.now() - timedelta(days=days)
    attempts = Attempt.objects.filter(user=user, status="SUBMITTED", started_at__gte=since).order_by("started_at")
    data = [
        {
            "id": a.id,
            "date": a.started_at.date().isoformat(),
            "score": a.score,
            "accuracy": a.accuracy,
        }
        for a in attempts
    ]
    return Response({"series": data})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_weak_topics(request):
    days = int(request.GET.get("days", 90))
    since = timezone.now() - timedelta(days=days)
    limit = int(request.GET.get("limit", 10))
    min_total = int(request.GET.get("min_total", 3))

    qs_items = AttemptItem.objects.filter(attempt__user=request.user, attempt__status="SUBMITTED", attempt__started_at__gte=since)
    agg = (
        qs_items.values("question__topic_id", "question__topic__name")
        .annotate(acc=Avg("is_correct"), total=Count("id"))
        .filter(total__gte=min_total)
        .order_by("acc", "-total")[:limit]
    )
    topics = [
        {"topic_id": row["question__topic_id"], "topic": row["question__topic__name"], "acc": row["acc"], "total": row["total"]}
        for row in agg
    ]
    return Response({
        "weak_topics": topics,
        "override_config": {"include_topics": [t["topic_id"] for t in topics]}
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def leaderboard(request):
    days = int(request.GET.get("days", 30))
    since = timezone.now() - timedelta(days=days)
    attempts = Attempt.objects.filter(status="SUBMITTED", started_at__gte=since)
    agg = (
        attempts.values("user__username")
        .annotate(avg_score=Avg("score"), avg_acc=Avg("accuracy"), attempts=Count("id"))
        .order_by("-avg_score")[:20]
    )
    return Response(list(agg))


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def global_dashboard(request):
    attempts = Attempt.objects.filter(status="SUBMITTED")
    top_modules = (
        AttemptItem.objects.filter(attempt__in=attempts)
        .values("question__module__name")
        .annotate(acc=Avg("is_correct"))
        .order_by("-acc")[:10]
    )
    lowest_modules = (
        AttemptItem.objects.filter(attempt__in=attempts)
        .values("question__module__name")
        .annotate(acc=Avg("is_correct"))
        .order_by("acc")[:10]
    )
    return Response(
        {
            "attempts": attempts.count(),
            "avg_score": attempts.aggregate(Avg("score"))["score__avg"],
            "top_modules": list(top_modules),
            "lowest_modules": list(lowest_modules),
        }
    )


@api_view(["GET"])
@permission_classes([IsParent])
def parent_summary(request):
    from django.utils import timezone
    days = int(request.GET.get("days", 30))
    since = timezone.now() - timedelta(days=days)
    parent = request.user
    children = parent.parent_of.all()
    out = []
    for child in children:
        attempts = Attempt.objects.filter(user=child, status="SUBMITTED")
        recent_attempts = attempts.filter(started_at__gte=since)
        summary = attempts.aggregate(avg_score=Avg("score"), avg_accuracy=Avg("accuracy"), attempts=Count("id"))
        time_spent = AttemptItem.objects.filter(attempt__in=recent_attempts).aggregate(sec=Sum("time_spent_sec"))['sec'] or 0
        attendance_count = getattr(child, 'attendance', None) and child.attendance.filter(date__gte=since.date()).count() or 0
        weak = (
            AttemptItem.objects.filter(attempt__in=recent_attempts)
            .values("question__topic__name")
            .annotate(acc=Avg("is_correct"), total=Count("id"))
            .filter(total__gte=3)
            .order_by("acc")[:5]
        )
        mid = timezone.now() - timedelta(days=min(15, days))
        earlier = AttemptItem.objects.filter(attempt__user=child, attempt__status="SUBMITTED", attempt__started_at__gte=since, attempt__started_at__lt=mid)
        later = AttemptItem.objects.filter(attempt__user=child, attempt__status="SUBMITTED", attempt__started_at__gte=mid)
        earlier_map = { r['question__topic__name']: r['acc'] for r in earlier.values('question__topic__name').annotate(acc=Avg('is_correct')) }
        improved = []
        for r in later.values('question__topic__name').annotate(acc=Avg('is_correct')):
            t = r['question__topic__name']
            if t is None:
                continue
            delta = (r['acc'] or 0) - (earlier_map.get(t) or 0)
            if delta > 0.1:
                improved.append({ 'topic': t, 'delta': float(delta) })
        improved.sort(key=lambda x: -x['delta'])
        out.append({
            "student_id": child.id,
            "student": child.username,
            "summary": summary,
            "attendance_30": attendance_count,
            "time_spent_30": time_spent,
            "weak_topics": list(weak),
            "improved_topics": improved[:5],
        })
    return Response({"children": out, "days": days})


@api_view(["GET"])
@permission_classes([IsTeacher])
def batch_report(request):
    try:
        batch_id = int(request.GET.get("batch_id"))
    except (TypeError, ValueError):
        return Response({"detail": "batch_id is required"}, status=400)
    days = int(request.GET.get("days", 30))
    since = timezone.now() - timedelta(days=days)

    User = get_user_model()
    students = User.objects.filter(batches__id=batch_id, role="STUDENT")
    attempts = Attempt.objects.filter(user__in=students, status="SUBMITTED", started_at__gte=since)

    student_stats = (
        attempts.values("user__id", "user__username")
        .annotate(avg_score=Avg("score"), avg_accuracy=Avg("accuracy"), attempts=Count("id"))
        .order_by("-avg_score")
    )

    topic_stats = (
        AttemptItem.objects.filter(attempt__in=attempts)
        .values("question__topic__name")
        .annotate(acc=Avg("is_correct"), total=Count("id"))
        .order_by("acc")
    )

    return Response({
        "students": list(student_stats),
        "topics": list(topic_stats),
    })


@api_view(["GET"])
@permission_classes([IsTeacher])
def weak_topics(request):
    days = int(request.GET.get("days", 90))
    since = timezone.now() - timedelta(days=days)
    limit = int(request.GET.get("limit", 10))
    min_total = int(request.GET.get("min_total", 5))

    qs_items = AttemptItem.objects.filter(attempt__status="SUBMITTED", attempt__started_at__gte=since)

    user_id = request.GET.get("user_id")
    batch_id = request.GET.get("batch_id")

    if user_id:
        qs_items = qs_items.filter(attempt__user_id=user_id)
    elif batch_id:
        User = get_user_model()
        students = User.objects.filter(batches__id=batch_id, role="STUDENT")
        qs_items = qs_items.filter(attempt__user__in=students)
    else:
        return Response({"detail": "user_id or batch_id required"}, status=400)

    agg = (
        qs_items.values("question__topic_id", "question__topic__name")
        .annotate(acc=Avg("is_correct"), total=Count("id"))
        .filter(total__gte=min_total)
        .order_by("acc", "-total")[:limit]
    )

    topics = [
        {"topic_id": row["question__topic_id"], "topic": row["question__topic__name"], "acc": row["acc"], "total": row["total"]}
        for row in agg
    ]

    return Response({
        "weak_topics": topics,
        "override_config": {"include_topics": [t["topic_id"] for t in topics]}
    })


@api_view(["GET"])
@permission_classes([IsAdmin])
def export_attempts_csv(request):
    attempts = Attempt.objects.select_related("user", "template").all().order_by("-started_at")[:5000]

    def row_iter():
        header = [
            "attempt_id",
            "user",
            "template",
            "status",
            "started_at",
            "submitted_at",
            "score",
            "total_marks",
            "accuracy",
        ]
        yield ",".join(header) + "\n"
        for a in attempts:
            row = [
                str(a.id),
                a.user.username,
                a.template.name,
                a.status,
                a.started_at.isoformat() if a.started_at else "",
                a.submitted_at.isoformat() if a.submitted_at else "",
                f"{a.score}",
                f"{a.total_marks}",
                f"{a.accuracy}",
            ]
            yield ",".join(row) + "\n"

    resp = StreamingHttpResponse(row_iter(), content_type="text/csv")
    resp["Content-Disposition"] = "attachment; filename=attempts.csv"
    return resp


@api_view(["GET"])
@permission_classes([IsAdmin])
def export_attempts_pdf(request):
    attempts = Attempt.objects.select_related("user", "template").all().order_by("-started_at")[:1000]
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    x0, y = 2*cm, height - 2*cm

    c.setFont("Helvetica-Bold", 16)
    c.drawString(x0, y, "Attempts Report")
    y -= 1*cm
    c.setFont("Helvetica", 9)
    headers = ["ID", "User", "Template", "Score", "Total", "Acc%", "Status", "Started"]
    col_w = [1.2*cm, 3*cm, 5*cm, 1.5*cm, 1.5*cm, 1.5*cm, 2*cm, 3.5*cm]

    def draw_row(vals):
        nonlocal y
        x = x0
        for v, w in zip(vals, col_w):
            c.drawString(x, y, str(v)[:40])
            x += w
        y -= 0.6*cm
        if y < 2*cm:
            c.showPage()
            c.setFont("Helvetica", 9)
            y = height - 2*cm

    draw_row(headers)
    c.setFont("Helvetica", 8)
    for a in attempts:
        vals = [
            a.id,
            a.user.username,
            a.template.name,
            f"{a.score}",
            f"{a.total_marks}",
            f"{a.accuracy:.1f}",
            a.status,
            a.started_at.strftime('%Y-%m-%d %H:%M') if a.started_at else '',
        ]
        draw_row(vals)

    c.save()
    pdf = buffer.getvalue()
    buffer.close()
    resp = HttpResponse(pdf, content_type='application/pdf')
    resp['Content-Disposition'] = 'attachment; filename=attempts.pdf'
    return resp


@api_view(["GET"]) 
@permission_classes([IsAdmin])
def export_attempts_xlsx(request):
    from openpyxl import Workbook
    attempts = Attempt.objects.select_related("user", "template").all().order_by("-started_at")[:5000]
    wb = Workbook()
    ws = wb.active
    ws.title = "Attempts"
    headers = ["ID", "User", "Template", "Status", "Started", "Submitted", "Score", "Total", "Acc%"]
    ws.append(headers)
    for a in attempts:
        ws.append([
            a.id,
            a.user.username,
            a.template.name,
            a.status,
            a.started_at.strftime('%Y-%m-%d %H:%M') if a.started_at else '',
            a.submitted_at.strftime('%Y-%m-%d %H:%M') if a.submitted_at else '',
            a.score,
            a.total_marks,
            round(a.accuracy or 0, 1),
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    resp = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    resp['Content-Disposition'] = 'attachment; filename=attempts.xlsx'
    return resp


@api_view(["GET"]) 
@permission_classes([IsParent])
def parent_report_card_pdf(request):
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    parent = request.user
    user_id = request.GET.get('user_id')
    children = parent.parent_of.all()
    if user_id:
        try:
            children = children.filter(id=int(user_id))
        except Exception:
            children = children.none()
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    x0, y = 2*cm, height - 2*cm
    c.setFont("Helvetica-Bold", 16)
    c.drawString(x0, y, "Performance Report")
    y -= 1*cm
    c.setFont("Helvetica", 9)
    for child in children:
        attempts = Attempt.objects.filter(user=child, status='SUBMITTED').order_by('-started_at')
        summary = attempts.aggregate(avg_score=Avg('score'), avg_accuracy=Avg('accuracy'), attempts=Count('id'))
        c.setFont("Helvetica-Bold", 12)
        c.drawString(x0, y, f"{child.username}")
        y -= 0.5*cm
        c.setFont("Helvetica", 9)
        c.drawString(x0, y, f"Avg Score: {summary.get('avg_score') or 0:.1f}  |  Avg Acc: {summary.get('avg_accuracy') or 0:.1f}%  |  Attempts: {summary.get('attempts') or 0}")
        y -= 0.4*cm
        items = AttemptItem.objects.filter(attempt__in=attempts)
        top = items.values('question__topic__name').annotate(acc=Avg('is_correct'), total=Count('id')).order_by('-acc')[:5]
        low = items.values('question__topic__name').annotate(acc=Avg('is_correct'), total=Count('id')).order_by('acc')[:5]
        c.drawString(x0, y, "Top Topics:")
        y -= 0.4*cm
        for t in top:
            c.drawString(x0+20, y, f"{t['question__topic__name']}: {t['acc'] and round(t['acc']*100) or 0}% ({t['total']})")
            y -= 0.35*cm
        c.drawString(x0, y, "Weak Topics:")
        y -= 0.4*cm
        for t in low:
            c.drawString(x0+20, y, f"{t['question__topic__name']}: {t['acc'] and round(t['acc']*100) or 0}% ({t['total']})")
            y -= 0.35*cm
        y -= 0.3*cm
        if y < 3*cm:
            c.showPage(); y = height - 2*cm; c.setFont("Helvetica", 9)
    c.save()
    pdf = buffer.getvalue()
    buffer.close()
    resp = HttpResponse(pdf, content_type='application/pdf')
    resp['Content-Disposition'] = 'attachment; filename=report_card.pdf'
    return resp


@api_view(["POST"]) 
@permission_classes([IsParent])
def parent_weekly_summary_email(request):
    """Send a weekly summary email to the parent for all linked children."""
    from django.core.mail import send_mail
    summary = parent_summary(request).data
    body_lines = ["Weekly Progress Summary"]
    for ch in summary.get('children', []):
        s = ch.get('summary') or {}
        body_lines.append(f"- {ch.get('student')}: avg score {s.get('avg_score') or 0:.1f}, avg acc {s.get('avg_accuracy') or 0:.1f}%, attempts {s.get('attempts') or 0}, attendance {ch.get('attendance_30') or 0}")
    body = "\n".join(body_lines)
    if not request.user.email:
        return Response({"detail": "parent email not set"}, status=400)
    try:
        send_mail(subject='Weekly Progress Summary', message=body, from_email=None, recipient_list=[request.user.email], fail_silently=False)
        return Response({"ok": True})
    except Exception as e:
        return Response({"detail": str(e)}, status=500)


@api_view(["POST"]) 
@permission_classes([IsAdmin])
def share_report(request):
    """
    Send a simple notification email with links to CSV/PDF/XLSX exports.
    Body: { to: ["email1@example.com"], message?: "optional text" }
    """
    to = request.data.get('to') or []
    msg = request.data.get('message') or 'Please find the latest exam reports attached as links.'
    if not isinstance(to, list) or not to:
        return Response({"detail": "to must be a non-empty list of emails"}, status=400)
    base = request.build_absolute_uri('/api/analytics/').rstrip('/')
    links = [
        f"{base}/export/attempts.csv",
        f"{base}/export/attempts.xlsx",
        f"{base}/export/attempts.pdf",
    ]
    body = msg + "\n\n" + "\n".join(links)
    try:
        from django.core.mail import send_mail
        send_mail(subject='Exam Reports', message=body, from_email=None, recipient_list=to, fail_silently=False)
    except Exception as e:
        return Response({"detail": f"email failed: {e}"}, status=500)
    return Response({"ok": True, "sent_to": to})
