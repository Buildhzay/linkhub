@echo off
cd /d "%~dp0server"
echo LINKHUB API: http://127.0.0.1:4000  (Ctrl+C to stop)
call npm start
pause
