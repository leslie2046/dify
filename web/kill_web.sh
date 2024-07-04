#!/bin/sh
kill -9 $(ps -ef|grep 'npm'|grep -v grep|awk '{print $2}')
kill -9 $(ps -ef|grep 'next-server'|grep -v grep|awk '{print $2}')
