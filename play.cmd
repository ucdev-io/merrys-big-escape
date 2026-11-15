@echo off
rem Merry's Big Escape: the home game server.
rem Double-click to start it. Phones and tablets on the Wi-Fi use the address it prints (port 8080).
rem Close this window to stop the game.
cd /d "%~dp0"
title Merry's Big Escape (game server)
call npm run play
pause
