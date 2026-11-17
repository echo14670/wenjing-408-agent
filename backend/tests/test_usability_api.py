from fastapi.testclient import TestClient
from main import create_app
from app.core.config import get_settings
from app.deps import get_question_store
from tests.conftest import make_question
from tools.agent_http_alpha_eval import preflight_blockers


def test_question_detail_and_missing():
    app = create_app()
    question = make_question('detail', 'Example', review_state='pending')
    class Store:
        def get_question(self, question_id):
            return question if question_id == 'detail' else None
    app.dependency_overrides[get_question_store] = lambda: Store()
    with TestClient(app) as client:
        result = client.get('/api/question/detail')
        assert result.status_code == 200
        assert result.json()['question_id'] == 'detail'
        assert result.json()['review_state'] == question.normalized_review_state()
        assert client.get('/api/question/missing').status_code == 404


def test_health_model_configuration():
    app = create_app()
    settings = get_settings()
    original = settings.llm_api_key, settings.llm_model
    try:
        with TestClient(app) as client:
            for key, model, expected in [('private-test-key', 'test-model', True), ('', '', False), ('   ', 'test-model', False)]:
                settings.llm_api_key, settings.llm_model = key, model
                response = client.get('/api/health')
                payload = response.json()
                if expected:
                    assert preflight_blockers(response.status_code, payload) == []
                assert payload['llm_configured'] is expected
                assert payload['llm_model'] == model
                assert payload['llm'] == {'configured': expected, 'model': model}
                assert 'private-test-key' not in response.text
    finally:
        settings.llm_api_key, settings.llm_model = original
