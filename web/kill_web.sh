#!/bin/sh
kill -9 $(ps -ef|grep 'npm'|grep -v grep|awk '{print $2}')
