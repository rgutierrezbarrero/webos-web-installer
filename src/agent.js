// Helper: recibe un .ipk subido y ejecuta 'ares install -d <device> <ipk>'
// Nota: Requiere `ares` en PATH o WEBOS_ARES_PATH apuntando al ejecutable.
// En Windows admite ares.cmd, ares.bat y ares.exe mediante shell: true automático.
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { spawnAres, getAresCmd, friendlySpawnError } = require('./spawnAres');

const app = express();

// Permitir CORS desde cualquier origen (útil en desarrollo local).
// En producción restringe origin a tus orígenes de confianza.
app.use(cors({ origin: true }));
app.options('*', cors());

app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Endpoint para instalar un fichero subido
app.post('/install-file', upload.single('ipk'), (req, res) => {
  const deviceId = req.body.deviceId;
  const filePath = req.file && req.file.path;
  if (!deviceId || !filePath) {
    return res.status(400).json({ error: 'deviceId y fichero ipk son obligatorios' });
  }

  console.log(`[ares] Instalando "${filePath}" en device "${deviceId}" usando "${getAresCmd()}"`);

  // Usamos transfer-encoding chunked para enviar logs en tiempo real
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Transfer-Encoding': 'chunked',
    'Access-Control-Allow-Origin': '*'
  });

  const child = spawnAres(['install', '-d', deviceId, filePath]);

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
    res.write(JSON.stringify({ type: 'exit', code }) + '\n');
    res.end();
  });
  child.on('error', (err) => {
    console.error('[spawn error]', err);
    const message = friendlySpawnError(err);
    res.write(JSON.stringify({ type: 'error', error: message }) + '\n');
    try { fs.unlinkSync(filePath); } catch (e) {}
    res.end();
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Helper listening on http://127.0.0.1:${PORT}`);
});
