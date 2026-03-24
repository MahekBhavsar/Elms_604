@echo off
title ELMS Desktop Application
cd /d %~dp0

echo 🚀 Starting ELMS (Integrated Backend + Frontend)...
echo (This may take a moment to initialize...)

npm run all

echo ✅ Services are running.
pause
