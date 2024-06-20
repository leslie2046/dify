#!/bin/sh
kill -9 $(ps -ef|grep 'flask run --host 0.0.0.0 --port=6006 --debug'|grep -v grep|awk '{print $2}')
kill -9 $(ps -ef|grep 'celery -A app.celery worker -P gevent -c 10 -Q dataset,generation,mail --loglevel DEBUG'|grep -v grep|awk '{print $2}')
