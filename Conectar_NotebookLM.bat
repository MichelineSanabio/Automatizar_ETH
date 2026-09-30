@echo off
chcp 65001 >nul
echo ============================================================
echo   Iniciando Edge com Depuração para Conexão do NotebookLM
echo ============================================================
echo.
echo 1. Fechando instâncias do Edge...
taskkill /IM msedge.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo 2. Abrindo Edge com porta de depuração 9222 e restaurando abas...
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --restore-last-session "https://notebook.google.com/notebook/7e7d73b8-3d8c-423c-9424-9a39fb0f8c9a"

echo.
echo 3. Aguardando 5 segundos para conexão...
timeout /t 5 /nobreak >nul

echo 4. Executando extrator Python...
cd /d "c:\Users\Misha\Documents\Github\Automatizar_ETH"
python "C:\Users\Misha\.gemini\antigravity-ide\brain\685bd7bd-d4b2-4999-8e7f-135332282b4d\scratch\extract_notebooklm.py"

echo.
echo ============================================================
echo   Processo Concluído! Verifique a pasta NotebookLLM
echo ============================================================
pause
