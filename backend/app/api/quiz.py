"""小测接口：固定题组出卷 + 按版本快照判分。

题组 co-memory-01 首版 version="1"，题目 COP005/COP006/COP007。

题面和判分依据来自随部署交付的只读题组目录。题库勘误不改变已发布版本，
切换当前版本后仍按旧卷的版本判分。
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from app.schemas.quiz import (
    QuizQuestion,
    QuizResponse,
    QuizResultItem,
    QuizSubmitRequest,
    QuizSubmitResponse,
)

router = APIRouter(prefix="/api", tags=["quiz"])

QUIZ_CATALOG_PATH = Path(__file__).resolve().parents[2] / "data" / "quiz_catalog.json"


@lru_cache(maxsize=1)
def _load_catalog(path: Path) -> dict[str, dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def _get_quiz(quiz_id: str) -> dict:
    quiz = _load_catalog(QUIZ_CATALOG_PATH).get(quiz_id)
    if quiz is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "quiz_not_found", "message": f"题组不存在：{quiz_id}"},
        )
    return quiz


@router.get("/quiz/{quiz_id}", response_model=QuizResponse)
def get_quiz(quiz_id: str) -> QuizResponse:
    quiz = _get_quiz(quiz_id)
    version = quiz["current_version"]
    snapshot = quiz["versions"][version]
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
def submit_quiz(quiz_id: str, payload: QuizSubmitRequest) -> QuizSubmitResponse:
    quiz = _get_quiz(quiz_id)
    snapshot = quiz["versions"].get(payload.version)
    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "version_mismatch",
                "message": f"题组版本不存在或已不可用：{payload.version}",
            },
        )

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
