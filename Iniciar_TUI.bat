@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
title Binance Quant Terminal - Console TUI Institucional
color 0B

cd /d "%~dp0"

echo.
echo =======================================================================
echo              INICIANDO TERMINAL TUI QUANT INSTITUCIONAL
echo =======================================================================
echo.
echo  [*] Verificando bibliotecas necessarias...
python -c "import rich" >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] A biblioteca rich nao foi encontrada.
    echo [*] Instalando dependencias do terminal...
    pip install rich requests
)

echo.
echo  [*] Iniciando interface de console TUI em tempo real...
echo  [i] Para sair, pressione Ctrl+C a qualquer momento.
echo.

python tui_terminal.py

if %errorlevel% neq 0 (
    echo.
    echo [!] Terminal TUI encerrado com codigo de erro %errorlevel%.
    pause
)
