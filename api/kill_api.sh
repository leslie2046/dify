#!/bin/sh
pkill -f "uv run flask run --host 0.0.0.0 --port=5001"
pkill -f "uv run celery"
pkill -f "uv run python -m celery"
