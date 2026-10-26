@echo off
chcp 65001 >nul
title 가스트 사격 실행기
rem ==============================================================
rem  더블클릭하면
rem   1) 랭킹 DB 서버(serve.cjs)를 작은 창으로 켜고
rem   2) Chrome(없으면 Edge)을 전체화면으로 열어 게임을 띄웁니다.
rem  게임을 끝낼 때: 브라우저는 Alt+F4, 서버는 작업표시줄의 "가스트 서버" 창을 닫으세요.
rem ==============================================================
cd /d "%~dp0"
set "URL=http://localhost:5190"

rem ---- Node.js 확인 ----
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [오류] Node.js 가 설치되어 있지 않습니다.
  echo  https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  echo.
  pause
  exit /b 1
)

rem ---- 서버가 이미 켜져 있지 않으면 켜기 ----
curl -s -o nul "%URL%" >nul 2>nul
if errorlevel 1 (
  echo  랭킹 DB 서버를 켜는 중...
  start "가스트 서버" /min cmd /k node serve.cjs
)

rem ---- 서버가 응답할 때까지 최대 15초 기다리기 ----
set /a TRIES=0
:wait
curl -s -o nul "%URL%" >nul 2>nul
if not errorlevel 1 goto ready
set /a TRIES+=1
if %TRIES% geq 15 (
  echo.
  echo  [오류] 서버가 켜지지 않았습니다. "가스트 서버" 창의 오류 메시지를 확인하세요.
  echo.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait

:ready
echo  서버 준비 완료: %URL%
if defined GHAST_NO_BROWSER exit /b 0

rem ---- 브라우저 찾기 (Chrome → Edge) ----
set "BROWSER="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do (
  if not defined BROWSER if exist %%P set "BROWSER=%%~P"
)

if not defined BROWSER (
  echo  Chrome/Edge 를 찾지 못해 기본 브라우저로 엽니다. F 키를 눌러 전체화면으로 바꾸세요.
  start "" "%URL%"
  exit /b 0
)

rem 게임 전용 프로필로 열어야 전체화면·소리 옵션이 항상 적용됩니다 (평소 쓰는 Chrome 과 분리).
start "" "%BROWSER%" --user-data-dir="%~dp0data\browser-profile" --app="%URL%" --start-fullscreen --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check --disable-pinch --overscroll-history-navigation=0
exit /b 0
