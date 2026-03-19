// Helper: recibe un .ipk subido y ejecuta 'ares install -d <device> <ipk>'
// Soporta WEBOS_ARES_PATH (ruta absoluta al ejecutable o a la carpeta bin).
// Requisitos: npm install express multer cors
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();

// CORS abierto para desarrollo local. En producción limita el origen.
app.use(cors({ origin: true }));
app.options('*', cors());

app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Limitar a 10 instalaciones por IP por minuto para evitar abuso
const installLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Inténtalo de nuevo en un minuto.' }
});

// Resuelve el ejecutable ares a partir de WEBOS_ARES_PATH (archivo o directorio) o PATH.
// Devuelve { cmd, useShell } donde useShell indica si spawn necesita shell:true.
function resolveAresCommand() {
  const envPath = process.env.WEBOS_ARES_PATH;
  let resolvedCmd = 'ares';

  if (envPath) {
    try {
      const stat = fs.statSync(envPath);
      if (stat.isFile()) {
        resolvedCmd = envPath;
      } else if (stat.isDirectory()) {
        // Buscar el ejecutable dentro de la carpeta
        const candidates = process.platform === 'win32'
          ? ['ares.exe', 'ares.bat', 'ares.cmd', 'ares']
          : ['ares'];
        for (const c of candidates) {
          const candidate = path.join(envPath, c);
          if (fs.existsSync(candidate)) {
            resolvedCmd = candidate;
            break;
          }
        }
      }
    } catch (e) {
      // statSync falló: WEBOS_ARES_PATH no existe; se usará 'ares' del PATH
    }
  }

  // En Windows, los scripts .bat/.cmd requieren shell:true para ejecutarse
  const ext = path.extname(resolvedCmd).toLowerCase();
  const useShell = process.platform === 'win32' && ['.bat', '.cmd'].includes(ext);

  return { cmd: resolvedCmd, useShell };
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/install-file', installLimiter, upload.single('ipk'), (req, res) => {
  const deviceId = req.body.deviceId;
  const filePath = req.file && req.file.path;
  if (!deviceId || !filePath) {
    return res.status(400).json({ error: 'deviceId y fichero ipk son obligatorios' });
  }

  const { cmd: ARES_CMD, useShell } = resolveAresCommand();
  const ipkOriginalName = (req.file && req.file.originalname) || path.basename(filePath);

  console.log(`[ares] Comando resuelto: ${ARES_CMD} (shell=${useShell})`);
  console.log(`[ares] Instalando "${ipkOriginalName}" en device "${deviceId}"`);

  // Validar existencia del ejecutable cuando se especifica ruta absoluta
  if (ARES_CMD !== 'ares' && !fs.existsSync(ARES_CMD)) {
    const msg = `No se encontró el ejecutable especificado: "${ARES_CMD}". ` +
      `Comprueba que WEBOS_ARES_PATH apunta al archivo ares (o a su carpeta bin).`;
    console.error('[ares]', msg);
    return res.status(500).json({ error: msg });
  }

  // Respuesta chunked para enviar logs en tiempo real
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Transfer-Encoding': 'chunked',
    'Access-Control-Allow-Origin': '*'
  });

  // Informar al cliente del comando exacto que se va a ejecutar
  res.write(JSON.stringify({
    type: 'info',
    text: `Ejecutando: ${ARES_CMD} install -d ${deviceId} <ipk>`
  }) + '\n');

  const child = spawn(ARES_CMD, ['install', '-d', deviceId, filePath], { shell: useShell });

  child.stdout.on('data', (d) => {
    const text = d.toString();
    console.log('[ares stdout]', text.trim());
    res.write(JSON.stringify({ type: 'stdout', text }) + '\n');
  });

  child.stderr.on('data', (d) => {
    const text = d.toString();
    console.error('[ares stderr]', text.trim());
    res.write(JSON.stringify({ type: 'stderr', text }) + '\n');
  });

  child.on('close', (code) => {
    try { fs.unlinkSync(filePath); } catch (e) {}
    console.log('[ares exit]', code);
    res.write(JSON.stringify({ type: 'exit', code, deviceId, ipk: ipkOriginalName }) + '\n');
    res.end();
  });

  child.on('error', (err) => {
    console.error('[ares spawn error]', err);
    let msg;
    if (err.code === 'ENOENT') {
      msg = `Ejecutable "${ARES_CMD}" no encontrado. ` +
        `Asegúrate de que el webOS CLI esté instalado y que "ares" esté en el PATH, ` +
        `o define la variable WEBOS_ARES_PATH con la ruta absoluta al binario ` +
        `(p.ej. /usr/local/bin/ares o C:\\webOS_TV_CLI\\bin\\ares.cmd).`;
    } else if (err.code === 'EINVAL') {
      msg = `Error al lanzar "${ARES_CMD}" (EINVAL). ` +
        `En Windows los scripts .bat/.cmd necesitan ejecutarse con shell. ` +
        `Asegúrate de usar la ruta completa al archivo .cmd/.bat en WEBOS_ARES_PATH.`;
    } else {
      msg = err.message || String(err);
    }
    res.write(JSON.stringify({ type: 'error', error: msg }) + '\n');
    try { fs.unlinkSync(filePath); } catch (e) {}
    res.end();
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Helper listening on http://127.0.0.1:${PORT}`);
});
