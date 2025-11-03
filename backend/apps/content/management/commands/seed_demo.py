from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction

from apps.accounts.models import User, Batch
from apps.content.models import (
    Qualification, Paper, Module, Chapter, Topic, Question
)
from apps.exams.models import TestTemplate, ScheduledTest


class Command(BaseCommand):
    help = "Seed demo data for the Exam Preparation Platform (CSE only: MCQs with 1 correct out of 4, and 1 medium DSA coding question)."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Seeding CSE demo data..."))

        # Batches
        batch_a, _ = Batch.objects.get_or_create(name="Batch A", defaults={"description": "Demo batch"})

        # Users
        teacher, created = User.objects.get_or_create(
            username="teacher1",
            defaults={
                "email": "teacher1@example.com",
                "role": User.Role.TEACHER,
            },
        )
        if created:
            teacher.set_password("demo1234")
            teacher.save()
        teacher.batches.add(batch_a)

        student1, created = User.objects.get_or_create(
            username="student1",
            defaults={
                "email": "student1@example.com",
                "role": User.Role.STUDENT,
            },
        )
        if created:
            student1.set_password("demo1234")
            student1.save()
        student1.batches.add(batch_a)

        student2, created = User.objects.get_or_create(
            username="student2",
            defaults={
                "email": "student2@example.com",
                "role": User.Role.STUDENT,
            },
        )
        if created:
            student2.set_password("demo1234")
            student2.save()
        student2.batches.add(batch_a)

        parent1, created = User.objects.get_or_create(
            username="parent1",
            defaults={
                "email": "parent1@example.com",
                "role": User.Role.PARENT,
            },
        )
        if created:
            parent1.set_password("demo1234")
            parent1.save()
        parent1.parent_of.add(student1)

        # Taxonomy (CSE)
        cse, _ = Qualification.objects.get_or_create(name="Computer Science Engineering")
        dsa, _ = Paper.objects.get_or_create(qualification=cse, name="Data Structures and Algorithms")
        core_mod, _ = Module.objects.get_or_create(paper=dsa, name="Core Concepts")
        ch_ds, _ = Chapter.objects.get_or_create(module=core_mod, name="Data Structures")
        ch_algo, _ = Chapter.objects.get_or_create(module=core_mod, name="Algorithms")
        t_arrays, _ = Topic.objects.get_or_create(chapter=ch_ds, name="Arrays")
        t_trees, _ = Topic.objects.get_or_create(chapter=ch_ds, name="Trees")
        t_graphs, _ = Topic.objects.get_or_create(chapter=ch_algo, name="Graphs")

        # MCQ questions (exactly 4 options, one correct) — 20 items
        q_data = [
            {"text": "Which data structure provides O(1) average time for insertion and lookup?", "topic": t_arrays,
             "choices": [
                 {"label": "Array", "value": "A"},
                 {"label": "Linked List", "value": "B"},
                 {"label": "Hash Table", "value": "C"},
                 {"label": "Binary Search Tree", "value": "D"},
             ], "answer": "C"},
            {"text": "What is the time complexity of binary search on a sorted array?", "topic": t_arrays,
             "choices": [
                 {"label": "O(n)", "value": "A"},
                 {"label": "O(log n)", "value": "B"},
                 {"label": "O(n log n)", "value": "C"},
                 {"label": "O(1)", "value": "D"},
             ], "answer": "B"},
            {"text": "Which traversal of a binary tree visits nodes in the order: Left, Root, Right?", "topic": t_trees,
             "choices": [
                 {"label": "Preorder", "value": "A"},
                 {"label": "Inorder", "value": "B"},
                 {"label": "Postorder", "value": "C"},
                 {"label": "Level order", "value": "D"},
             ], "answer": "B"},
            {"text": "Dijkstra's algorithm computes:", "topic": t_graphs,
             "choices": [
                 {"label": "Minimum Spanning Tree", "value": "A"},
                 {"label": "All-pairs shortest paths", "value": "B"},
                 {"label": "Single-source shortest paths (non-negative weights)", "value": "C"},
                 {"label": "Topological ordering", "value": "D"},
             ], "answer": "C"},
            {"text": "Which of the following is a stable sorting algorithm?", "topic": t_arrays,
             "choices": [
                 {"label": "Quick Sort", "value": "A"},
                 {"label": "Merge Sort", "value": "B"},
                 {"label": "Heap Sort", "value": "C"},
                 {"label": "Selection Sort", "value": "D"},
             ], "answer": "B"},
            {"text": "Which operation on an array has O(n) time in the worst case?", "topic": t_arrays,
             "choices": [
                 {"label": "Access by index", "value": "A"},
                 {"label": "Append at end (amortized)", "value": "B"},
                 {"label": "Insert at beginning", "value": "C"},
                 {"label": "Update by index", "value": "D"},
             ], "answer": "C"},
            {"text": "Which data structure is ideal for implementing a LRU cache?", "topic": t_arrays,
             "choices": [
                 {"label": "Queue only", "value": "A"},
                 {"label": "Hash Map + Doubly Linked List", "value": "B"},
                 {"label": "Stack", "value": "C"},
                 {"label": "Binary Heap", "value": "D"},
             ], "answer": "B"},
            {"text": "Height of a balanced BST with n nodes is:", "topic": t_trees,
             "choices": [
                 {"label": "O(1)", "value": "A"},
                 {"label": "O(log n)", "value": "B"},
                 {"label": "O(n)", "value": "C"},
                 {"label": "O(n log n)", "value": "D"},
             ], "answer": "B"},
            {"text": "Postfix expression evaluation uses which data structure?", "topic": t_arrays,
             "choices": [
                 {"label": "Queue", "value": "A"},
                 {"label": "Stack", "value": "B"},
                 {"label": "Deque", "value": "C"},
                 {"label": "Priority Queue", "value": "D"},
             ], "answer": "B"},
            {"text": "A complete binary tree of height h has at most how many nodes?", "topic": t_trees,
             "choices": [
                 {"label": "h", "value": "A"},
                 {"label": "2^h", "value": "B"},
                 {"label": "2^{h+1} - 1", "value": "C"},
                 {"label": "h^2", "value": "D"},
             ], "answer": "C"},
            {"text": "Which structure is best for BFS traversal of a graph?", "topic": t_graphs,
             "choices": [
                 {"label": "Stack", "value": "A"},
                 {"label": "Queue", "value": "B"},
                 {"label": "Priority Queue", "value": "C"},
                 {"label": "Set", "value": "D"},
             ], "answer": "B"},
            {"text": "Union-Find (DSU) efficiently supports:", "topic": t_graphs,
             "choices": [
                 {"label": "Range queries", "value": "A"},
                 {"label": "Connectivity queries with unions", "value": "B"},
                 {"label": "Shortest path queries", "value": "C"},
                 {"label": "Top-k queries", "value": "D"},
             ], "answer": "B"},
            {"text": "Worst-case time complexity of Quick Sort is:", "topic": t_arrays,
             "choices": [
                 {"label": "O(n)", "value": "A"},
                 {"label": "O(n log n)", "value": "B"},
                 {"label": "O(n^2)", "value": "C"},
                 {"label": "O(log n)", "value": "D"},
             ], "answer": "C"},
            {"text": "Which traversal can reconstruct a BST uniquely when given sorted order?", "topic": t_trees,
             "choices": [
                 {"label": "Inorder alone", "value": "A"},
                 {"label": "Preorder alone (if BST)", "value": "B"},
                 {"label": "Postorder alone (if BST)", "value": "C"},
                 {"label": "Level order alone", "value": "D"},
             ], "answer": "B"},
            {"text": "In a min-heap, the smallest element is located at:", "topic": t_arrays,
             "choices": [
                 {"label": "Any leaf", "value": "A"},
                 {"label": "Root", "value": "B"},
                 {"label": "Rightmost leaf", "value": "C"},
                 {"label": "Leftmost leaf", "value": "D"},
             ], "answer": "B"},
            {"text": "Which hashing technique reduces primary clustering?", "topic": t_arrays,
             "choices": [
                 {"label": "Linear probing", "value": "A"},
                 {"label": "Quadratic probing", "value": "B"},
                 {"label": "Chaining", "value": "C"},
                 {"label": "Double hashing", "value": "D"},
             ], "answer": "D"},
            {"text": "Which algorithm is used to find MST?", "topic": t_graphs,
             "choices": [
                 {"label": "Dijkstra", "value": "A"},
                 {"label": "Floyd–Warshall", "value": "B"},
                 {"label": "Kruskal or Prim", "value": "C"},
                 {"label": "Bellman–Ford", "value": "D"},
             ], "answer": "C"},
            {"text": "Dynamic Programming typically trades:", "topic": t_arrays,
             "choices": [
                 {"label": "Time for space", "value": "A"},
                 {"label": "Space for time", "value": "B"},
                 {"label": "Both equally", "value": "C"},
                 {"label": "Neither", "value": "D"},
             ], "answer": "B"},
            {"text": "Which data structure supports O(1) amortized push and pop at the same end?", "topic": t_arrays,
             "choices": [
                 {"label": "Queue", "value": "A"},
                 {"label": "Stack", "value": "B"},
                 {"label": "Deque", "value": "C"},
                 {"label": "Vector with insert at front", "value": "D"},
             ], "answer": "B"},
            {"text": "Topo sort is defined for:", "topic": t_graphs,
             "choices": [
                 {"label": "Undirected graphs only", "value": "A"},
                 {"label": "DAGs (Directed Acyclic Graphs)", "value": "B"},
                 {"label": "Any directed graph", "value": "C"},
                 {"label": "Trees only", "value": "D"},
             ], "answer": "B"},
        ]

        created_mcq = 0
        for item in q_data:
            q, created_flag = Question.objects.get_or_create(
                qualification=cse,
                paper=dsa,
                module=core_mod,
                chapter=item["topic"].chapter,
                topic=item["topic"],
                text=item["text"],
                defaults={
                    "qtype": Question.Type.MCQ_SINGLE,
                    "difficulty": Question.Difficulty.MEDIUM,
                    "skill_type": Question.Skill.APPLICATION,
                    "choices": item["choices"],
                    "correct_answer": {"single": item["answer"]},
                    "marks": 3.0,
                },
            )
            # Ensure existing questions are updated to required format/marks
            q.qtype = Question.Type.MCQ_SINGLE
            q.difficulty = Question.Difficulty.MEDIUM
            q.skill_type = Question.Skill.APPLICATION
            q.choices = item["choices"]
            q.correct_answer = {"single": item["answer"]}
            q.marks = 3.0
            q.save(update_fields=["qtype","difficulty","skill_type","choices","correct_answer","marks"])
            if created_flag:
                created_mcq += 1

        # Coding question (DSA, medium level)
        coding_text = (
            "Valid Anagram\n\n"
            "Given two strings s and t, return true if t is an anagram of s, and false otherwise.\n"
            "Constraints: 1 <= len(s), len(t) <= 5e4; s and t consist of lowercase English letters.\n\n"
            "Implement a function isAnagram(s: str, t: str) -> bool."
        )
        cq, _ = Question.objects.get_or_create(
            qualification=cse,
            paper=dsa,
            module=core_mod,
            chapter=ch_algo,
            topic=t_graphs,
            text=coding_text,
            defaults={
                "qtype": Question.Type.LONG,
                "difficulty": Question.Difficulty.MEDIUM,
                "skill_type": Question.Skill.APPLICATION,
                "choices": [],
                "correct_answer": {},
                "marks": 40.0,
            },
        )
        # Ensure marks and metadata
        cq.qtype = Question.Type.LONG
        cq.difficulty = Question.Difficulty.MEDIUM
        cq.skill_type = Question.Skill.APPLICATION
        cq.marks = 40.0
        cq.save(update_fields=["qtype","difficulty","skill_type","marks"])

        # Test Template (CSE)
        template, _ = TestTemplate.objects.get_or_create(
            name="CSE DSA Practice",
            qualification=cse,
            paper=dsa,
            defaults={
                "description": "Practice set: 20 MCQs + 1 coding, 60 min duration",
                "mode": TestTemplate.Mode.PRACTICE,
                "config": {
                    "duration_minutes": 60,
                    "count": 21,
                    "randomize": True,
                    "difficulty_mix": {"EASY": 0, "MEDIUM": 100, "HARD": 0},
                    "negative_mark": 0.0,
                },
                "created_by": teacher,
            },
        )

        # Schedule
        now = timezone.now()
        starts = now + timezone.timedelta(minutes=5)
        ends = starts + timezone.timedelta(hours=1)
        schedule, _ = ScheduledTest.objects.get_or_create(
            template=template,
            starts_at=starts,
            ends_at=ends,
        )
        schedule.batches.add(batch_a)
        schedule.students.add(student1, student2)

        self.stdout.write(self.style.SUCCESS(f"CSE demo data seeded. MCQs created (new): {created_mcq}"))
