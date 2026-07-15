FROM python:3.12-slim

WORKDIR /app

# system deps kept minimal; pandas/numpy wheels are prebuilt
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# non-root user
RUN useradd -m appuser && chown -R appuser /app
USER appuser

ENV DB_PATH=/app/trading.db
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
