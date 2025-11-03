from django.urls import path
from .views import my_progress, global_dashboard, my_trends, leaderboard, export_attempts_csv, parent_summary, export_attempts_pdf, batch_report, weak_topics, my_weak_topics, export_attempts_xlsx, share_report, parent_report_card_pdf, parent_weekly_summary_email

urlpatterns = [
    path("me/", my_progress),
    path("trends/", my_trends),
    path("me/weak-topics/", my_weak_topics),
    path("leaderboard/", leaderboard),
    path("global/", global_dashboard),
    path("parent/summary/", parent_summary),
    path("parent/report-card.pdf", parent_report_card_pdf),
    path("parent/weekly-summary/", parent_weekly_summary_email),
    path("teacher/batch-report/", batch_report),
    path("teacher/weak-topics/", weak_topics),
    path("export/attempts.csv", export_attempts_csv),
    path("export/attempts.pdf", export_attempts_pdf),
    path("export/attempts.xlsx", export_attempts_xlsx),
    path("share/", share_report),
]
