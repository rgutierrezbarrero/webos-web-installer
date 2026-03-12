// Helper con CORS explícito, manejo de preflight y detección de ares no encontrado.
// Requisitos: npm install express multer cors
// Uso: define WEBOS_ARES_PATH con la ruta absoluta al ejecutable ares (o ares-install.cmd en Windows)
//      si no está en PATH, o deja que resuelva 'ares' automáticamente.
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();

// Permitir CORS desde cualquier origen (útil en desarrollo).
// En producción, restringe origin a tus orígenes confiables.
app.use(cors({ origin: true }));
// Responder explícitamente a las peticiones OPTIONS (preflight)
app.options('*', cors());

app.use(express.json());

const upload = multer({ dest: 'uploads/' });

/**
 * Determina si el ejecutable necesita shell:true para poder ser invocado.
 * - Ficheros .cmd/.bat/.ps1/.sh siempre necesitan shell.
 * - En Windows, cualquier ejecutable que no sea .exe también necesita shell
 *   (para que cmd.exe pueda resolver extensiones como .cmd en el PATH).
 */
function needsShell(cmd) {
  const ext = path.extname(cmd).toLowerCase();
  if (['.cmd', '.bat', '.ps1', '.sh'].includes(ext)) return true;
  if (process.platform === 'win32' && ext !== '.exe') return true;
  return false;
}

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Endpoint para instalar un fichero subido
app.post('/install-file', upload.single('ipk'), (req, res) => {
  const deviceId = req.body.deviceId;
  const filePath = req.file && req.file.path;
  if (!deviceId || !filePath) {
    return res.status(400).json({ error: 'deviceId y fichero ipk son obligatorios' });
  }

  // Comando a usar: variable de entorno WEBOS_ARES_PATH o 'ares' por defecto
  const ARES_CMD = process.env.WEBOS_ARES_PATH || 'ares';
  const useShell = needsShell(ARES_CMD);

  console.log(`Instalando ${filePath} en device ${deviceId} usando: ${ARES_CMD} (shell:${useShell})`);

  // Usamos transfer-encoding chunked para enviar logs en tiempo real
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Transfer-Encoding': 'chunked'
  });

  const child = spawn(ARES_CMD, ['install', '-d', deviceId, filePath], { shell: useShell });

  child.stdout.on('data', (d) => {
    const s = d.toString();
    console.log('[ares stdout]', s.trim());
    res.write(JSON.stringify({ type: 'stdout', text: s }) + '\n');
  });
  child.stderr.on('data', (d) => {
    const s = d.toString();
    console.error('[ares stderr]', s.trim());
    res.write(JSON.stringify({ type: 'stderr', text: s }) + '\n');
  });
  child.on('close', (code) => {
    try { fs.unlinkSync(filePath); } catch (e) {}
    console.log('[ares exit]', code);
    res.write(JSON.stringify({ type: 'exit', code }) + '\n');
    res.end();
  });
  child.on('error', (err) => {
    console.error('[spawn error]', err);
    let msg;
    if (err.code === 'ENOENT' || err.code === 'EINVAL') {
      msg = `No se pudo ejecutar "${ARES_CMD}". ` +
            `Asegúrate de que el webOS CLI (ares) esté instalado y accesible. ` +
            `Opciones: (1) instala el webOS SDK/CLI y añade el directorio bin a tu PATH, o ` +
            `(2) define la variable de entorno WEBOS_ARES_PATH con la ruta absoluta al ejecutable ` +
            `(p.ej. C:\\webos\\bin\\ares-install.cmd o /usr/local/bin/ares-install).`;
    } else {
      msg = err.message || String(err);
    }
    console.error(msg);
    res.write(JSON.stringify({ type: 'error', error: msg }) + '\n');
    try { fs.unlinkSync(filePath); } catch (e) {}
    res.end();
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Helper listening on http://127.0.0.1:${PORT}`);
});
