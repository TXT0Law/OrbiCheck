FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_LINK_MODE=copy
ENV PATH="/app/backend/.venv/bin:${PATH}"
ENV HOME=/tmp
ENV MPLCONFIGDIR=/tmp/matplotlib

WORKDIR /app/backend

# matplotlib (used by report_service for embedded PDF charts) needs a baseline
# font set. Install DejaVu so charts render readable labels in the slim image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system orbicheck \
    && useradd --system --gid orbicheck --home-dir /tmp --shell /usr/sbin/nologin orbicheck

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY backend/pyproject.toml backend/uv.lock backend/alembic.ini ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend ./
COPY docker/backend/entrypoint.sh /usr/local/bin/backend-entrypoint.sh
COPY docker/celery/entrypoint.sh /usr/local/bin/celery-entrypoint.sh

RUN chmod +x /usr/local/bin/backend-entrypoint.sh /usr/local/bin/celery-entrypoint.sh \
    && uv sync --frozen --no-dev \
    && chown -R orbicheck:orbicheck /app/backend

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=12 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=3)"

USER orbicheck

CMD ["/usr/local/bin/backend-entrypoint.sh"]
