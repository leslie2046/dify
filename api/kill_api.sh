#!/bin/sh
pkill -f "flask run --host 0.0.0.0 --port=6006 --debug"
pkill -f "celery -A app.celery worker -P gevent -c 10 -Q dataset,generation,mail --loglevel DEBUG"
