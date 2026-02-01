@echo off
:: Título exacto para que el panel lo pueda cerrar
title SISTEMA COMEDOR - DETCUADOR
color 0a
cls

echo ==============================================
echo   UBICACION: C:\Sistemas\Comedor
echo   ESPERANDO ARRANQUE DE SERVICIOS (30s)
echo ==============================================

:: 1. Espera de seguridad para XAMPP
timeout /t 30 /nobreak

:: 2. FORZAR LA UBICACIÓN (El truco clave)
:: Esto asegura que siempre encuentre el archivo .py y la base de datos
cd /d "C:\Sistemas\Comedor"
cls

:inicio
echo ==========================================
echo   INICIANDO SISTEMA DE COMEDOR
echo   (No cierres esta ventana manualmente)
echo ==========================================
echo.

:: Ejecutamos usando la ruta absoluta
"C:\Python312\python.exe" comedor.py

:: Si se cierra, reiniciamos
echo.
echo ?? EL SISTEMA SE CERRÓ.
echo ?? Reintentando en 5 segundos...
timeout /t 5
cls
goto inicio