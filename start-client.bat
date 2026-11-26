@echo off
cd /d "%~dp0client"
echo LINKHUB UI: http://localhost:5173  (start the API first)
call npm run dev
pause
