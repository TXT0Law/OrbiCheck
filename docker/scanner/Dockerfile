FROM alpine:3.19

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV HOME=/tmp
ENV XDG_CACHE_HOME=/tmp/.cache

WORKDIR /app

RUN apk add --no-cache \
    nmap \
    python3 \
    py3-pip \
    && addgroup -S orbicheck \
    && adduser -S -G orbicheck -h /tmp orbicheck

COPY docker/scanner/requirements.txt ./requirements.txt
RUN pip install --break-system-packages --no-cache-dir -r requirements.txt

COPY --chown=orbicheck:orbicheck docker/scanner/app.py ./app.py

EXPOSE 5000

USER orbicheck

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]
