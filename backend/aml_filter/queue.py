"""Background-job enqueue helper — fail-soft when Redis is unavailable."""

import logging

from redis import Redis
from rq import Queue

from aml_filter.config import get_settings

logger = logging.getLogger(__name__)


def enqueue_screening(job_name: str, **kwargs: object) -> bool:
    """Enqueue a screening job.

    Returns:
        True if the job was enqueued, False if Redis is unavailable
        (caller can decide to run inline or report partial state).
    """
    settings = get_settings()
    try:
        connection = Redis.from_url(settings.redis_url)
        Queue(settings.screening_queue_name, connection=connection).enqueue(job_name, **kwargs)
    except Exception as exc:  # noqa: BLE001 — fail-soft: caller decides fallback
        logger.warning("Failed to enqueue %s (Redis unavailable): %s", job_name, exc)
        return False
    return True
