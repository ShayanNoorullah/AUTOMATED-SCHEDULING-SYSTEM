FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY app/ ./app/
COPY templates/ ./templates/
COPY static/ ./static/
COPY supabase/ ./supabase/

ENV PYTHONUNBUFFERED=1 \
    PORT=5000 \
    USE_WAITRESS=1 \
    DOCKER=1

EXPOSE 5000

CMD ["python", "app.py"]
