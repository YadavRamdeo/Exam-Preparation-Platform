import random
from collections import defaultdict
from datetime import timedelta, datetime
from django.utils import timezone
from django.db.models import Q, Count, Avg
from apps.content.models import Question
from apps.exams.models import AttemptItem, Attempt


def pick_questions(qualification_id, paper_id, config, user=None):
    """
    Select questions based on config: difficulty mix, randomization, and optional filters.
    config supports:
      - count: int (default 20)
      - difficulty_mix: {EASY:%, MEDIUM:%, HARD:%}
      - randomize: bool (default True)
      - include_topics / include_chapters / include_modules: [ids]
      - category: ALL | UNANSWERED | INCORRECT | CORRECT (based on user's history)
      - personalized: WEAK (pick from user's weak topics in recent attempts)
      - lookback_days: int (for personalized/category windows)
    """
    count = int(config.get("count", 20))
    diff_mix = config.get("difficulty_mix", {"EASY": 40, "MEDIUM": 40, "HARD": 20})
    lookback_days = int(config.get("lookback_days", 90))

    pool = Question.objects.filter(is_active=True, qualification_id=qualification_id, paper_id=paper_id)

    # Structural filters
    if tids := config.get("include_topics"):
        pool = pool.filter(topic_id__in=tids)
    if cids := config.get("include_chapters"):
        pool = pool.filter(chapter_id__in=cids)
    if mids := config.get("include_modules"):
        pool = pool.filter(module_id__in=mids)

    # Category filters based on user's history
    if user is not None:
        since = timezone.now() - timedelta(days=lookback_days)
        items = AttemptItem.objects.filter(attempt__user=user, attempt__started_at__gte=since)
        if (cat := config.get("category")) in {"UNANSWERED", "INCORRECT", "CORRECT"}:
            seen_q_ids = items.values_list("question_id", flat=True).distinct()
            if cat == "UNANSWERED":
                pool = pool.exclude(id__in=seen_q_ids)
            elif cat == "INCORRECT":
                inc_ids = items.filter(is_correct=False).values_list("question_id", flat=True)
                pool = pool.filter(id__in=inc_ids)
            elif cat == "CORRECT":
                cor_ids = items.filter(is_correct=True).values_list("question_id", flat=True)
                pool = pool.filter(id__in=cor_ids)
        # Personalized weak topics: pick topics with lowest accuracy for the user
        if str(config.get("personalized")).upper() == "WEAK":
            topic_perf = (
                items.values("question__topic_id")
                .annotate(acc=Avg("is_correct"), cnt=Count("id"))
                .order_by("acc", "-cnt")
            )[:10]
            weak_topic_ids = [row["question__topic_id"] for row in topic_perf if row["question__topic_id"]]
            if weak_topic_ids:
                pool = pool.filter(topic_id__in=weak_topic_ids)

    # Difficulty mix selection
    by_diff = defaultdict(list)
    for q in pool:
        by_diff[q.difficulty].append(q)

    selected = []
    for diff, pct in diff_mix.items():
        n = max(0, round(count * (pct / 100)))
        bucket = by_diff.get(diff, [])
        random.shuffle(bucket)
        selected.extend(bucket[:n])

    # fill remaining if under count
    if len(selected) < count:
        remaining = [q for q in pool if q not in selected]
        random.shuffle(remaining)
        selected.extend(remaining[: count - len(selected)])

    if config.get("randomize", True):
        random.shuffle(selected)

    selected = selected[:count]

    # Enforce exactly one LONG (coding) at the end, rest non-LONG
    pool_list = list(pool)
    coding_candidates = [q for q in pool_list if q.qtype == "LONG"]
    nonlong_pool = [q for q in pool_list if q.qtype != "LONG"]

    # Keep only non-LONG in the main body
    others = [q for q in selected if q.qtype != "LONG"]

    # Ensure we have count-1 non-LONG (fill from pool if needed)
    if len(others) < max(0, count - 1):
        fillers = [q for q in nonlong_pool if q not in others]
        random.shuffle(fillers)
        need = (count - 1) - len(others)
        if need > 0:
            others.extend(fillers[:need])

    # Trim extras beyond count-1
    if len(others) > max(0, count - 1):
        others = others[: count - 1]

    # Pick exactly one coding question if available
    coding_q = None
    if coding_candidates:
        # prefer one already selected to preserve randomness
        existing_coding = next((q for q in selected if q.qtype == "LONG"), None)
        if existing_coding:
            coding_q = existing_coding
        else:
            random.shuffle(coding_candidates)
            # choose one not already in others
            coding_q = next((q for q in coding_candidates if q not in others), coding_candidates[0])

    # Build final ordered list: others first, then coding (if any)
    result = others + ([coding_q] if coding_q else [])
    # If still short (no coding available), backfill with more non-LONG to reach count
    if len(result) < count:
        fillers = [q for q in nonlong_pool if q not in others]
        random.shuffle(fillers)
        result.extend(fillers[: count - len(result)])

    return result[:count]


def score_question(question, response, negative_mark=0.0, partial_multi=False):
    """
    Basic scoring logic for MCQ/TF/Short; subjective returns 0 and is_correct False for manual eval.
    For MCQ_MULTI with partial_multi=True: award proportional credit for correct selections,
    subtract negative_mark only if any incorrect options were selected.
    """
    if question.qtype in ("MCQ_SINGLE", "TRUE_FALSE"):
        correct = question.correct_answer.get("value")
        is_correct = response.get("value") == correct
        return (question.marks if is_correct else -negative_mark), is_correct
    if question.qtype == "MCQ_MULTI":
        correct_set = set(question.correct_answer.get("values", []))
        resp_set = set(response.get("values", []))
        is_exact = resp_set == correct_set
        if is_exact:
            return question.marks, True
        if partial_multi and correct_set:
            # partial credit for correct selections; penalize if any extra wrong selected
            correct_selected = len(resp_set & correct_set)
            wrong_selected = len(resp_set - correct_set)
            base = question.marks * (correct_selected / len(correct_set))
            penalty = negative_mark if wrong_selected > 0 else 0.0
            score = max(0.0, base - penalty)
            return score, False
        return (-negative_mark), False
    if question.qtype in ("SHORT",):
        # simple normalize
        correct_text = (question.correct_answer.get("text") or "").strip().lower()
        resp_text = (response.get("text") or "").strip().lower()
        is_correct = bool(correct_text) and correct_text == resp_text
        return (question.marks if is_correct else -negative_mark), is_correct
    # LONG subjective -> manual grading later
    return 0.0, False
