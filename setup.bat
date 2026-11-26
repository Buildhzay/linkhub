@echo off
setlocal
echo === LINKHUB first-time setup ===
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22.13 or later, then reopen this window.
  pause
  exit /b 1
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=13)?0:1)"
if errorlevel 1 (
  echo Node.js 22.13 or later is required.
  node -v
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm, then reopen this window.
  pause
  exit /b 1
)
cd /d "%~dp0server"
if not exist .env copy .env.example .env
call npm run seed
if errorlevel 1 (
  echo Database seeding failed.
  pause
  exit /b 1
)
cd /d "%~dp0client"
call npm install
if errorlevel 1 (
  echo Frontend dependency installation failed. Check Internet access and retry.
  pause
  exit /b 1
)
echo.
echo Setup finished. Set JWT_SECRET in server\.env before starting the API.
echo Then run start-server.bat and start-client.bat in separate windows.
pause
