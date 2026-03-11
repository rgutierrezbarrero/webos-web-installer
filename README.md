# webos-web-installer

Web UI + helper local para instalar paquetes (.ipk) en televisores LG webOS usando el CLI `ares`.

Arquitectura
- web/: frontend estático (HTML + JS) que permite seleccionar el paquete y el deviceId.
- src/agent.js: helper Node que recibe la petición y ejecuta `ares install` localmente.

Requisitos
- webOS SDK / CLI instalado (binario `ares` disponible en PATH).
- Televisor LG con Developer Mode activado y emparejado.
- Ejecutar el helper en la misma máquina donde está instalado `ares`.

Uso (desarrollo)
1. Instala dependencias:
   ```
npm install
   ```
2. Arranca el helper (escucha en localhost:3000 por defecto):
   ```
npm run start
   ```
3. Abre `web/index.html` en tu navegador (o servir la carpeta web con un servidor estático) y usa la interfaz para instalar.

Seguridad
- El helper sólo escucha en `localhost` por defecto.
- No distribuimos ni instalamos el binario `ares`; el usuario debe tenerlo.
