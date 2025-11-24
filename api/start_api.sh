#!/bin/sh
uv sync
uv run flask db upgrade
nohup uv run flask run --host 0.0.0.0 --port=5001 --debug > api.log 2>&1 &
nohup uv run celery -A app.celery worker -P threads -c 10 --loglevel DEBUG -Q dataset,priority_dataset,priority_pipeline,pipeline,mail,ops_trace,app_deletion,plugin,workflow_storage,conversation,workflow,schedule_poller,schedule_executor,triggered_workflow_dispatcher,trigger_refresh_executor > worker.log 2>&1 &

