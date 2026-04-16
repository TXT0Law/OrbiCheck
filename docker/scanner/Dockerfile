FROM alpine:3.19

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apk add --no-cache \
    nmap \
    python3 \
    py3-pip

COPY docker/scanner/requirements.txt ./requirements.txt
RUN pip install --break-system-packages --no-cache-dir -r requirements.txt

COPY docker/scanner/app.py ./app.py

EXPOSE 5000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]
