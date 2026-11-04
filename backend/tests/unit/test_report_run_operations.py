from uuid import uuid4

import pytest

from app.models.report_schedule import ReportScheduleRun, ReportScheduleRunStatus
from app.services import report_schedule_service as service


@pytest.mark.unit
@pytest.mark.parametrize('summary,outcome', [
    ({'channels': {'email': [{'success': True}]}, 'success': True}, 'accepted'),
    ({'channels': {}, 'success': True}, 'stored'),
    ({'channels': {'email': [{'success': True}, {'success': False}]}}, 'partial'),
    ({}, 'unknown'),
    ({'outcome': 'unconfirmed'}, 'unconfirmed'),
    ({'channels': {'email': [{'success': 'true'}]}}, 'unknown'),
])
def test_operations_receipts(summary: dict, outcome: str) -> None:
    run = ReportScheduleRun(id=uuid4(), schedule_id=uuid4(), status=ReportScheduleRunStatus.COMPLETED,
                            delivery_summary={**summary, 'secret': 'https://secret.invalid/token'})
    response = service._run_to_response(run, {})
    assert response.operations.delivery_state == outcome
    assert 'secret.invalid' not in response.model_dump_json()


@pytest.mark.unit
@pytest.mark.parametrize('status', [ReportScheduleRunStatus.PENDING, ReportScheduleRunStatus.GENERATING])
def test_pending_does_not_request_review(status: ReportScheduleRunStatus) -> None:
    run = ReportScheduleRun(id=uuid4(), schedule_id=uuid4(), status=status)
    operations = service._run_to_response(run, {}).operations
    assert operations.delivery_state == 'not_started'
    assert operations.review_reason is None


@pytest.mark.unit
def test_unconfirmed_negative_receipt_stays_unknown() -> None:
    run = ReportScheduleRun(id=uuid4(), schedule_id=uuid4(), status=ReportScheduleRunStatus.FAILED,
                            delivery_summary={'outcome': 'unconfirmed', 'channels': {
                                'email': [{'success': True}, {'success': False}]}})
    operations = service._run_to_response(run, {}).operations
    assert operations.delivery_state == 'unconfirmed'
    assert operations.channels[0].accepted_count == 1
    assert operations.channels[0].failed_count == 0
    assert operations.channels[0].unknown_count == 1


@pytest.mark.unit
@pytest.mark.parametrize('summary', [
    {'channels': {'email': {'success': True}}},
    {'channels': {'slack': {'success': True}}, 'success': False},
    {'channels': {'email': [{'success': False}]}, 'success': True},
    {'channels': {'unknown': {'success': True}}, 'success': True},
    ['malformed'],
])
def test_invalid_or_contradictory_summary_is_unknown(summary: object) -> None:
    run = ReportScheduleRun(id=uuid4(), schedule_id=uuid4(), status=ReportScheduleRunStatus.COMPLETED,
                            delivery_summary=summary)
    assert service._run_to_response(run, {}).operations.delivery_state == 'unknown'


@pytest.mark.unit
def test_artifact_state_comes_from_owned_report_metadata() -> None:
    from app.models.report import ReportStatus

    report_id = uuid4()
    run = ReportScheduleRun(id=uuid4(), schedule_id=uuid4(), report_id=report_id,
                            status=ReportScheduleRunStatus.FAILED)
    response = service._run_to_response(run, {report_id: ReportStatus.COMPLETED})
    assert response.report_id == report_id
    assert response.operations.report_id == report_id
    assert response.operations.artifact_state == 'completed'
    assert response.operations.delivery_state == 'unknown'


@pytest.mark.unit
def test_configuration_rejection_proves_delivery_not_started() -> None:
    run = ReportScheduleRun(id=uuid4(), schedule_id=uuid4(), status=ReportScheduleRunStatus.FAILED,
                            delivery_summary={'channels': {}, 'success': False,
                                              'error': 'email_recipients_missing'})
    operations = service._run_to_response(run, {}).operations
    assert operations.delivery_state == 'not_started'
    assert operations.review_reason is None
