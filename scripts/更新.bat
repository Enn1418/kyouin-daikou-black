@echo off
chcp 65001 >nul
title 教員代行 努ブラック ― 更新
cd /d "%~dp0"

echo.
echo  最新版に入れ替えます。
echo  ブリッジとアプリの窓は、先に閉じておいてください。
echo.
pause

echo  ダウンロードしています...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $u='https://github.com/Enn1418/kyouin-daikou-black/archive/refs/heads/claude/teacher-focused-design-kv19k9.zip'; Invoke-WebRequest -Uri $u -OutFile 'new.zip'; if (Test-Path 'kyouin-app2') { Remove-Item 'kyouin-app2' -Recurse -Force }; Expand-Archive -Path 'new.zip' -DestinationPath '.' -Force; Rename-Item 'kyouin-daikou-black-claude-teacher-focused-design-kv19k9' 'kyouin-app2'; Remove-Item 'new.zip'"
if errorlevel 1 goto error

echo  部品を入れています（数分かかります）...
cd kyouin-app2
call npm install
if errorlevel 1 goto error

echo.
echo  終わりました。「起動.bat」を実行してください。
echo.
echo  ※ 教材フォルダ（%%USERPROFILE%%\kyouin）はそのままです。
echo  ※ APIキーとトークンも入れ直す必要はありません。
pause
exit /b

:error
echo.
echo  うまくいきませんでした。この画面の文字をそのまま伝えてください。
pause
