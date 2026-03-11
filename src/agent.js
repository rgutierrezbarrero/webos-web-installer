// Helper mínimo: recibe un .ipk subido o una ruta y ejecuta 'ares install -d <device> <ipk>'
// Nota: Requiere `ares` en PATH y device ya emparejado.
const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());

// Endpoint simple para instalar un fichero subido
app.post('/install-file', upload.single('ipk'), (req, res) => {
  const deviceId = req.body.deviceId;
  const filePath = req.file && req.file.path;
  if (!deviceId || !filePath) {
    return res.status(400).json({ error: 'deviceId y fichero ipk son obligatorios' });
  }

  // Usamos transfer-encoding chunked para enviar logs en tiempo real
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Transfer-Encoding': 'chunked'
  });

  const child = spawn('ares', ['install', '-d', deviceId, filePath]);

  child.stdout.on('data', (d) => {
    // emitimos logs en chunked response
    res.write(JSON.stringify({ type: 'stdout', text: d.toString() }) + '\n');
  });
  child.stderr.on('data', (d) => {
    res.write(JSON.stringify({ type: 'stderr', text: d.toString() }) + '\n');
  });
  child.on('close', (code) => {
    // limpieza del fichero subido
    try { fs.unlinkSync(filePath); } catch (e) {}
    res.write(JSON.stringify({ type: 'exit', code }) + '\n');
    res.end();
  });
  child.on('error', (err) => {
    res.write(JSON.stringify({ type: 'error', error: err.message }) + '\n');
    try { fs.unlinkSync(filePath); } catch (e) {}
    res.end();
  });
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Helper listening on http://127.0.0.1:${PORT}`);
});
