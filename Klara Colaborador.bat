@echo off
wscript //nologo "C:\Users\sacal\Downloads\Klara Gestão\iniciar_klara.vbs"
timeout /t 2 /nobreak >nul
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:8787/colaborador
