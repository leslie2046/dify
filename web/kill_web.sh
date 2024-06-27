#!/bin/sh
kill -9 $(ps -ef|grep 'npm'|grep -v grep|awk '{print $2}')
<<<<<<< HEAD
<<<<<<< HEAD
kill -9 $(ps -ef|grep 'next-server'|grep -v grep|awk '{print $2}')
=======
>>>>>>> 6619e2a3 (add shell to start/kill web)
=======
kill -9 $(ps -ef|grep 'next-server'|grep -v grep|awk '{print $2}')
>>>>>>> 0e019f7b (update shell)
