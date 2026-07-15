#!/usr/bin/env bash
# Start the AI Trade Decision Engine API.
# Usage: ./run.sh   (then open http://localhost:8000/docs)
set -e
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
