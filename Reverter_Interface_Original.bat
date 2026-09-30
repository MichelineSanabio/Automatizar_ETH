@echo off
chcp 65001 >nul
title Restaurar Interface Original
color 0E

cd /d "%~dp0"

echo =======================================================================
echo            RESTAURANDO INTERFACE ANTERIOR (ROLLBACK)
echo =======================================================================
echo.

if exist "templates\index.html.original_backup" (
    copy /y "templates\index.html.original_backup" "templates\index.html" >nul
    echo  [OK] templates\index.html restaurado para a versao original.
) else (
    echo  [!] Arquivo de backup templates\index.html.original_backup nao encontrado.
)

if exist "static\css\style.css.original_backup" (
    copy /y "static\css\style.css.original_backup" "static\css\style.css" >nul
    echo  [OK] static\css\style.css restaurado para a versao original.
) else (
    echo  [!] Arquivo de backup static\css\style.css.original_backup nao encontrado.
)

echo.
echo =======================================================================
echo  Restauracao concluida com sucesso!
echo  Recarregue a pagina no navegador (F5 ou Ctrl+F5).
echo =======================================================================
pause
