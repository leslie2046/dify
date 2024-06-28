#!/bin/sh
poetry install
flask db upgrade
nohup flask run --host 0.0.0.0 --port=6006 --debug &> api.log &
nohup celery -A app.celery worker -P gevent -c 10 -Q dataset,generation,mail --loglevel DEBUG &> worker.log &
