# Guía de Solución de Problemas - Sistema Comedor

Esta guía explica cómo resolver los problemas más comunes sin necesidad de modificar el código.

## ⚠️ Regla de Oro
**NUNCA** ejecutes el script `python main.py` manualmente si el servicio está encendido. Esto causa el error de "Doble Marcación".
Siempre usa los comandos `systemctl` descritos abajo.

---

## 1. El sistema no imprime o se "traba"
Si las huellas marcan pero no sale ticket, o el sistema parece detenido:

### Paso 1: Reiniciar el Servicio Principal (Worker)
Este comando reinicia el cerebro del sistema (el que habla con el biométrico y la impresora).
```bash
sudo systemctl restart comedor-worker
```

### Paso 2: Verificar que arrancó bien
Ejecuta esto y busca el texto verde que diga `Active: active (running)`.
```bash
sudo systemctl status comedor-worker
```

---

## 2. Error "Backend no responde" o Login fallido
Si la página web no carga o no deja entrar a los usuarios manuales:

### Paso 1: Reiniciar el Backend (Web)
```bash
sudo systemctl restart comedor-backend
```

### Paso 2: Verificar estado
```bash
sudo systemctl status comedor-backend
```

---

## 3. Problema de "Doble Marcación" (Salen 2 tickets o error de duplicado)
Esto pasa cuando hay "fantasmas" del programa corriendo al mismo tiempo.

### Solución: Matar todo y reiniciar limpio
Copia y pega este comando completo. Detendrá el servicio, matará cualquier proceso suelto de python y volverá a arrancar el servicio limpio.

```bash
sudo systemctl stop comedor-worker && sudo pkill -f main.py && sudo systemctl start comedor-worker
```

---

## 4. Ver los Logs (Qué está pasando)
Para ver lo que el sistema está haciendo en tiempo real (quién marca, errores, etc):

**Ver logs del Worker (Biométrico/Impresora):**
```bash
journalctl -u comedor-worker -f
```
*(Presiona Ctrl + C para salir)*

**Ver logs del Backend (Página Web):**
```bash
journalctl -u comedor-backend -f
```

---

## Resumen de Comandos Rápidos

| Acción | Comando |
| :--- | :--- |
| **Arrancar todo** | `sudo systemctl start comedor-worker comedor-backend` |
| **Reiniciar todo** | `sudo systemctl restart comedor-worker comedor-backend` |
| **Parar todo** | `sudo systemctl stop comedor-worker comedor-backend` |
| **Ver estado** | `sudo systemctl status comedor-worker comedor-backend` |
