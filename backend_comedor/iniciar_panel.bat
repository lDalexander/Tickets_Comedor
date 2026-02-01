@echo off
title SERVIDOR WEB - REPORTES COMEDOR
color 3f
cls

echo ==============================================
echo   INICIANDO SERVIDOR DE REPORTES WEB
echo   Tecnologia: Streamlit + Python 3.12
echo ==============================================
echo.

:: 1. Espera de seguridad (para que XAMPP arranque bien)
echo Esperando a que lo demas inicie correctamente...
timeout /t 20 /nobreak 

:: 2. FORZAR LA UBICACIÓN (Para que encuentre las carpetas)
cd /d "C:\Sistemas\Comedor"

:: 3. EJECUTAR STREAMLIT
:: Usamos "-m streamlit run" para llamar al modulo directamente.
:: Esto evita errores de "streamlit no se reconoce como comando interno".
echo Lanzando aplicacion...
"C:\Python312\python.exe" -m streamlit run app_reportes.py

:: 4. MANEJO DE ERRORES
:: Si el servidor se cierra o falla, el comando 'pause'
:: evitará que la ventana negra se cierre, para que puedas leer el error.
echo.
echo ==============================================
echo   ? EL SERVIDOR SE DETUVO O OCURRIO UN ERROR
echo   Lee el mensaje rojo arriba para saber que paso.
echo ==============================================
pause