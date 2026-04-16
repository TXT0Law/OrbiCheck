FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_LINK_MODE=copy
ENV PATH="/app/backend/.venv/bin:${PATH}"

WORKDIR /app/backend

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY backend/pyproject.toml backend/alembic.ini ./
RUN uv venv .venv

COPY backend ./
COPY docker/backend/entrypoint.sh /usr/local/bin/backend-entrypoint.sh
COPY docker/celery/entrypoint.sh /usr/local/bin/celery-entrypoint.sh

RUN chmod +x /usr/local/bin/backend-entrypoint.sh /usr/local/bin/celery-entrypoint.sh \
    && uv pip install --python .venv/bin/python -e .

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=12 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=3)"

CMD ["/usr/local/bin/backend-entrypoint.sh"]
