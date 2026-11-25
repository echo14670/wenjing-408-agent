"""小测接口：固定题组出卷 + 按版本判分。

题组 co-memory-01 首版 version="1"，题目 COP005/COP006/COP007。
出卷只返回作答所需字段；标准答案与解析在交卷后返回。
"""

from __future__ import annotations

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

# 固定题组定义。后续扩展题组时在此登记；修订题组用新 version 号。
QUIZZES: dict[str, dict] = {
    "co-memory-01": {
        "version": "1",
        "title": "存储器层次结构",
        "question_ids": ["COP005", "COP006", "COP007"],
    },
}


def _get_quiz(quiz_id: str) -> dict:
    quiz = QUIZZES.get(quiz_id)
    if quiz is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "quiz_not_found", "message": f"题组不存在：{quiz_id}"},
        )
    return quiz


def _quiz_questions(store: QuestionStore, quiz: dict) -> list[QuizQuestion]:
    out: list[QuizQuestion] = []
    for qid in quiz["question_ids"]:
        q = store.get_question(qid)
        if q is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "quiz_question_missing", "message": f"题组题目缺失：{qid}"},
            )
        out.append(
            QuizQuestion(
                question_id=q.question_id,
                stem=q.stem,
                options=list(q.options),
                source_ref=q.source_ref,
            )
        )
    return out


@router.get("/quiz/{quiz_id}", response_model=QuizResponse)
def get_quiz(
    quiz_id: str,
    store: Annotated[QuestionStore, Depends(get_question_store)],
) -> QuizResponse:
    quiz = _get_quiz(quiz_id)
    return QuizResponse(
        quiz_id=quiz_id,
        version=quiz["version"],
        title=quiz["title"],
        questions=_quiz_questions(store, quiz),
    )


@router.post("/quiz/{quiz_id}/submit", response_model=QuizSubmitResponse)
def submit_quiz(
    quiz_id: str,
    payload: QuizSubmitRequest,
    store: Annotated[QuestionStore, Depends(get_question_store)],
) -> QuizSubmitResponse:
    quiz = _get_quiz(quiz_id)

    if payload.version != quiz["version"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "version_mismatch",
                "message": f"题组版本不匹配：提交 {payload.version}，当前 {quiz['version']}",
            },
        )

    expected = set(quiz["question_ids"])
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
    for qid in quiz["question_ids"]:
        q = store.get_question(qid)
        selected = payload.answers[qid]
        correct = (q.answer or "").strip()
        # 选项合法性：单选的选项字母在 A/B/C/D 范围内（选项数 = 题选项数）
        option_labels = [chr(ord("A") + i) for i in range(len(q.options))]
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
                solution=q.solution,
            )
        )

    return QuizSubmitResponse(
        quiz_id=quiz_id,
        version=quiz["version"],
        attempt_id=payload.attempt_id,
        score=score,
        total=len(quiz["question_ids"]),
        results=results,
    )
