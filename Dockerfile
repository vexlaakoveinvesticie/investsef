# ── 1. fáza: build frontendu (Node beží v cloude, nie u teba) ───────────────
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── 2. fáza: Python backend + hotový frontend ───────────────────────────────
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=frontend /fe/dist ./static

RUN useradd -m appuser && chown -R appuser /app
USER appuser

ENV DB_PATH=/app/trading.db
EXPOSE 8000

# hosting (Render/Railway) dodá premennú PORT sám
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
