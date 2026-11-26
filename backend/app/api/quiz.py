"""小测接口：固定题组出卷 + 按版本快照判分。

题组 co-memory-01 首版 version="1"，题目 COP005/COP006/COP007。

判分依据「版本快照」而非活题库：首次访问某版本时，从题库冻结该版本的
题干/选项/答案/解析/来源并持久化到 backend/data/quiz_snapshots.json。
此后题库勘误不影响已冻结版本；发布新版本后旧版本快照保留，旧卷仍可交。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_question_store
from app.schemas.quiz import (
    QuizQuestion,
    QuizResponse,
    QuizResultItem,
    QuizSubmitRequest,
    QuizSubmitResponse,
)
from app.services.question_store import QuestionStore

router = APIRouter(prefix="/api", tags=["quiz"])

SNAPSHOT_PATH = Path(__file__).resolve().parents[2] / "data" / "quiz_snapshots.json"

# 固定题组定义。修订题组时改 version 号，旧版本快照保留在 snapshots 文件。
QUIZZES: dict[str, dict] = {
    "co-memory-01": {
        "version": "1",
        "title": "存储器层次结构",
        "question_ids": ["COP005", "COP006", "COP007"],
    },
}

_snapshots: dict | None = None


def _load_snapshots() -> dict:
    if SNAPSHOT_PATH.exists():
        return json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    return {}


def _save_snapshots(data: dict) -> None:
    SNAPSHOT_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _get_snapshots() -> dict:
    global _snapshots
    if _snapshots is None:
        _snapshots = _load_snapshots()
    return _snapshots


def _freeze(store: QuestionStore, quiz_id: str, version: str, quiz: dict) -> dict:
    """从当前题库冻结一个版本快照，并持久化。"""
    questions = []
    for qid in quiz["question_ids"]:
        q = store.get_question(qid)
        if q is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "quiz_question_missing", "message": f"题组题目缺失：{qid}"},
            )
        questions.append(
            {
                "question_id": q.question_id,
                "stem": q.stem,
                "options": list(q.options),
                "answer": q.answer,
                "solution": q.solution,
                "source_ref": q.source_ref,
            }
        )
    snapshot = {"title": quiz["title"], "questions": questions}
    data = _get_snapshots()
    data.setdefault(quiz_id, {})[version] = snapshot
    _save_snapshots(data)
    return snapshot


def _get_quiz(quiz_id: str) -> dict:
    quiz = QUIZZES.get(quiz_id)
    if quiz is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "quiz_not_found", "message": f"题组不存在：{quiz_id}"},
        )
    return quiz


def _snapshot_for(store: QuestionStore, quiz_id: str, version: str, quiz: dict) -> dict:
    """取某版本快照；未冻结则冻结（仅限当前版本，旧版本缺失视为版本不匹配）。"""
    snapshots = _get_snapshots()
    snapshot = snapshots.get(quiz_id, {}).get(version)
    if snapshot is not None:
        return snapshot
    if version != quiz["version"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "version_mismatch",
                "message": f"题组版本不存在或已不可用：{version}",
            },
        )
    return _freeze(store, quiz_id, version, quiz)


@router.get("/quiz/{quiz_id}", response_model=QuizResponse)
def get_quiz(
    quiz_id: str,
    store: Annotated[QuestionStore, Depends(get_question_store)],
) -> QuizResponse:
    quiz = _get_quiz(quiz_id)
    version = quiz["version"]
    snapshot = _snapshot_for(store, quiz_id, version, quiz)
    questions = [
        QuizQuestion(
            question_id=q["question_id"],
            stem=q["stem"],
            options=q["options"],
            source_ref=q["source_ref"],
        )
        for q in snapshot["questions"]
    ]
    return QuizResponse(
        quiz_id=quiz_id,
        version=version,
        title=snapshot["title"],
        questions=questions,
    )


@router.post("/quiz/{quiz_id}/submit", response_model=QuizSubmitResponse)
def submit_quiz(
    quiz_id: str,
    payload: QuizSubmitRequest,
    store: Annotated[QuestionStore, Depends(get_question_store)],
) -> QuizSubmitResponse:
    quiz = _get_quiz(quiz_id)
    snapshot = _snapshot_for(store, quiz_id, payload.version, quiz)

    expected = {q["question_id"] for q in snapshot["questions"]}
    submitted = set(payload.answers.keys())
    missing = expected - submitted
    extra = submitted - expected
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "missing_answers", "message": f"未作答的题目：{sorted(missing)}"},
        )
    if extra:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "unknown_question", "message": f"题组外题号：{sorted(extra)}"},
        )

    score = 0
    results: list[QuizResultItem] = []
    for q in snapshot["questions"]:
        qid = q["question_id"]
        selected = payload.answers[qid]
        correct = (q["answer"] or "").strip()
        option_labels = [chr(ord("A") + i) for i in range(len(q["options"]))]
        if selected not in option_labels:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_option", "message": f"{qid} 的选项无效：{selected}"},
            )
        is_correct = selected == correct
        if is_correct:
            score += 1
        results.append(
            QuizResultItem(
                question_id=qid,
                selected=selected,
                correct=correct,
                is_correct=is_correct,
                solution=q["solution"],
            )
        )

    return QuizSubmitResponse(
        quiz_id=quiz_id,
        version=payload.version,
        attempt_id=payload.attempt_id,
        score=score,
        total=len(snapshot["questions"]),
        results=results,
    )
