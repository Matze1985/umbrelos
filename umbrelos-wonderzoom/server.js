import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const app = express();
const PORT = Number(process.env.PORT || 8080);
const SCENES_DIR = path.resolve(process.env.SCENES_DIR || './data/scenes');
const ALLOWED = new Set(['.splat', '.spz', '.ply', '.ksplat']);
fs.mkdirSync(SCENES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, SCENES_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = path.basename(file.originalname, ext)
      .normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'scene';
    cb(null, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${safe}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(ALLOWED.has(ext) ? null : new Error('Nicht unterstütztes Format. Erlaubt: .splat, .spz, .ply, .ksplat'), ALLOWED.has(ext));
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static('dist'));

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'viewer-only', scenes: fs.readdirSync(SCENES_DIR).length }));

app.get('/api/scenes', (_req, res) => {
  const scenes = fs.readdirSync(SCENES_DIR, { withFileTypes: true })
    .filter(e => e.isFile() && ALLOWED.has(path.extname(e.name).toLowerCase()))
    .map(e => {
      const p = path.join(SCENES_DIR, e.name);
      const s = fs.statSync(p);
      return { name: e.name, size: s.size, modified: s.mtime.toISOString(), url: `/scenes/${encodeURIComponent(e.name)}` };
    }).sort((a,b) => b.modified.localeCompare(a.modified));
  res.json(scenes);
});

app.post('/api/scenes', upload.single('scene'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei empfangen.' });
  res.status(201).json({ name: req.file.filename, size: req.file.size });
});

app.delete('/api/scenes/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const ext = path.extname(name).toLowerCase();
  if (!ALLOWED.has(ext)) return res.status(400).json({ error: 'Ungültiger Dateityp.' });
  const target = path.join(SCENES_DIR, name);
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'Szene nicht gefunden.' });
  fs.unlinkSync(target);
  res.status(204).end();
});

app.use('/scenes', express.static(SCENES_DIR, { fallthrough: false, setHeaders(res) {
  res.setHeader('Cache-Control', 'private, max-age=3600');
}}));

app.get('*', (_req, res) => res.sendFile(path.resolve('dist/index.html')));

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || 'Anfrage fehlgeschlagen.' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`WonderZoom viewer listening on ${PORT}`));
