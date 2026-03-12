/**
 * spawnAres.js
 *
 * Helper multiplataforma para invocar el CLI de webOS (`ares`).
 *
 * Problema en Windows:
 *   - `spawn('ares.cmd', args)` o `spawn('ares.bat', args)` lanza EINVAL porque
 *     Windows no puede ejecutar archivos .cmd/.bat directamente como proceso.
 *   - La solución es usar `{ shell: true }` para que cmd.exe los ejecute.
 *   - En Windows también se usa `shell: true` cuando el comando es simplemente
 *     'ares' sin extensión, porque PATHEXT (que permite resolver ares.cmd) sólo
 *     funciona dentro de la shell, no en spawn directo.
 *
 * Variable de entorno WEBOS_ARES_PATH:
 *   Permite apuntar al ejecutable de ares si no está en PATH, por ejemplo:
 *     export WEBOS_ARES_PATH=/usr/local/bin/ares          (macOS/Linux)
 *     $env:WEBOS_ARES_PATH = 'C:\webos\bin\ares.cmd'      (Windows PowerShell)
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

/**
 * Devuelve el comando ares a usar.
 * Usa WEBOS_ARES_PATH si está definido, si no, 'ares' (asume que está en PATH).
 * @returns {string}
 */
function getAresCmd() {
  return process.env.WEBOS_ARES_PATH || 'ares';
}

/**
 * Determina si la invocación necesita `shell: true`.
 *
 * En Windows:
 *   - Los archivos .cmd y .bat SIEMPRE necesitan shell.
 *   - Cuando el comando no tiene extensión (p.ej. 'ares'), la resolución vía
 *     PATHEXT (que permite encontrar ares.cmd en PATH) sólo funciona en una
 *     shell, así que también usamos shell: true.
 *
 * En macOS/Linux: no se necesita shell para binarios.
 *
 * @param {string} cmd - Ruta o nombre del ejecutable.
 * @param {string} [platform] - process.platform (inyectable para tests).
 * @returns {boolean}
 */
function needsShell(cmd, platform) {
  const plat = platform !== undefined ? platform : process.platform;
  if (plat !== 'win32') return false;
  const ext = path.extname(cmd).toLowerCase();
  // .cmd y .bat requieren shell; sin extensión también (PATHEXT sólo en shell)
  return ext === '.cmd' || ext === '.bat' || ext === '';
}

/**
 * Lanza el proceso ares con los argumentos indicados, aplicando las opciones
 * de spawn correctas según plataforma y tipo de ejecutable.
 *
 * @param {string[]} args - Argumentos para ares (p.ej. ['install', '-d', deviceId, filePath]).
 * @returns {import('child_process').ChildProcess}
 */
function spawnAres(args) {
  const cmd = getAresCmd();
  const opts = { shell: needsShell(cmd) };
  return spawn(cmd, args, opts);
}

/**
 * Devuelve un mensaje de error amigable para errores de spawn frecuentes.
 *
 * @param {Error & { code?: string }} err
 * @returns {string}
 */
function friendlySpawnError(err) {
  const cmd = getAresCmd();
  if (err.code === 'ENOENT') {
    return (
      `No se encontró el ejecutable "${cmd}". ` +
      `Asegúrate de que el webOS CLI (ares) está instalado y disponible en PATH, ` +
      `o define la variable de entorno WEBOS_ARES_PATH con la ruta completa al ` +
      `ejecutable (p.ej. /usr/local/bin/ares en macOS/Linux, ` +
      `C:\\webos\\bin\\ares.cmd en Windows).`
    );
  }
  if (err.code === 'EINVAL') {
    return (
      `Error al invocar "${cmd}" (EINVAL). ` +
      `En Windows, los archivos .cmd y .bat deben ejecutarse a través de la shell. ` +
      `Comprueba que WEBOS_ARES_PATH apunta a un ejecutable válido (.cmd, .bat o .exe).`
    );
  }
  return err.message;
}

module.exports = { getAresCmd, needsShell, spawnAres, friendlySpawnError };
