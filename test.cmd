@echo off
for /f %%i in ('where %1') do (
  cd /d %%~dpi
  )