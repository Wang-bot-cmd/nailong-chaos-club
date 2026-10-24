@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js，或直接打开附带的「奶龙发疯事务所.html」。
  pause
  exit /b 1
)
node server.mjs
pause
