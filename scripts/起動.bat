@echo off
chcp 65001 >nul
title 教員代行 努ブラック ― 起動
cd /d "%~dp0kyouin-app2"

if not exist "package.json" goto notfound

rem ── 手持ちの資料を読ませたいとき ──────────────────────────
rem 次の2行の先頭の rem を外し、フォルダのパスを書き換えてください。
rem 読み取り専用です。書き込まれることはありません。
set "REFNAME=ノート"
set "REFPATH="
rem set "REFPATH=C:\Users\%USERNAME%\Documents\Obsidian\授業"
rem ─────────────────────────────────────────────────────────

if defined REFPATH (
  start "教材フォルダ ブリッジ" cmd /k npm run bridge -- --root "%USERPROFILE%\kyouin" --ref "%REFNAME%=%REFPATH%"
) else (
  start "教材フォルダ ブリッジ" cmd /k npm run bridge -- --root "%USERPROFILE%\kyouin"
)

timeout /t 4 >nul
start "アプリ" cmd /k npm run dev

echo.
echo  2つの窓を開きました。ブラウザが自動で開きます。
echo  終わるときは、その2つの窓を閉じてください。
echo.
timeout /t 6 >nul
exit /b

:notfound
echo.
echo  kyouin-app2 が見つかりません。先に「更新.bat」を実行してください。
pause
