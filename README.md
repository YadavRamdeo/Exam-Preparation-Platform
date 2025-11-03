# FinTram Global – Exam Preparation Platform

Monorepo with Django (backend) and React (frontend).

## Quick start

Backend:
1. cd backend
2. pip install -r requirements.txt
3. python manage.py makemigrations
4. python manage.py migrate
5. python manage.py createsuperuser
6. python manage.py runserver 0.0.0.0:8000

Frontend:
1. cd frontend
2. npm i
3. npm run dev

Update CORS origin via `FRONTEND_ORIGIN` env if needed.

## Features (MVP)
- Auth (JWT), roles (Admin/Student/Teacher/Parent)
- Taxonomy and Question bank (CRUD + CSV upload)
- Test templates, scheduling
- Student attempts: Exam/Practice modes, bookmarking, notes
- Analytics endpoints (my progress, global dashboard)

Further enhancements: advanced proctoring, 2FA, subjective manual marking, leaderboards UI, batch management UI.
