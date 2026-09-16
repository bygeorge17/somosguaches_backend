const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const ffprobe = require('@ffprobe-installer/ffprobe');
const adminAuthorization = require('../middleware/adminAuthorization');

const router = express.Router();
const uploadDirectory = path.join(__dirname, '..', 'public', 'uploads', 'content');
const uploadUrlPrefix = '/uploads/content/';
const maxImageBytes = 8 * 1024 * 1024;
const maxVideoBytes = 50 * 1024 * 1024;
const maxVideoSeconds = 30;
const imageTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
const videoTypes = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

fs.mkdirSync(uploadDirectory, { recursive: true });

function mediaKind(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const mimeType = file.mimetype;
  if (imageTypes[extension]
      && [imageTypes[extension], 'application/octet-stream'].includes(mimeType)) {
    return 'image';
  }
  if (videoTypes[extension]
      && [videoTypes[extension], 'application/octet-stream'].includes(mimeType)) {
    return 'video';
  }
  return null;
}

function safeExtension(file) {
  const originalExtension = path.extname(file.originalname || '').toLowerCase();
  const allTypes = { ...imageTypes, ...videoTypes };
  if (allTypes[originalExtension]) return originalExtension;
  return Object.entries(allTypes).find(([, mime]) => mime === file.mimetype)?.[0] || '';
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory),
    filename: (_req, file, callback) => {
      const baseName = path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'media';
      callback(null, `${Date.now()}-${baseName}${safeExtension(file)}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    if (!mediaKind(file)) return callback(new Error('Tipo de archivo no permitido'));
    callback(null, true);
  },
  limits: { fileSize: maxVideoBytes, files: 1 },
});

function removeFile(file) {
  if (!file?.path) return Promise.resolve();
  return fs.promises.unlink(file.path).catch(() => {});
}

function videoDuration(filePath) {
  return new Promise((resolve, reject) => {
    execFile(
      ffprobe.path,
      ['-v', 'error', '-show_entries', 'format=duration', '-of',
        'default=noprint_wrappers=1:nokey=1', filePath],
      (error, stdout) => {
        if (error) return reject(error);
        resolve(Number(stdout.toString().trim() || 0));
      },
    );
  });
}

router.post('/', adminAuthorization, (req, res) => {
  upload.single('media')(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError instanceof multer.MulterError
        ? 'El archivo supera el tamaño máximo permitido'
        : uploadError.message;
      return res.status(400).json({ error: message });
    }

    const file = req.file;
    try {
      if (!file) return res.status(400).json({ error: 'Selecciona un archivo' });

      const kind = mediaKind(file);
      if (req.body.kind && req.body.kind !== kind) {
        await removeFile(file);
        return res.status(400).json({ error: 'El archivo no coincide con el tipo seleccionado' });
      }
      if (kind === 'image' && file.size > maxImageBytes) {
        await removeFile(file);
        return res.status(400).json({ error: 'La imagen no puede superar 8 MB' });
      }
      if (kind === 'video') {
        const duration = await videoDuration(file.path);
        if (!Number.isFinite(duration) || duration <= 0) {
          await removeFile(file);
          return res.status(400).json({ error: 'No se pudo leer la duración del video' });
        }
        if (duration > maxVideoSeconds) {
          await removeFile(file);
          return res.status(400).json({ error: 'El video no puede durar más de 30 segundos' });
        }
      }

      return res.status(201).json({
        mediaUrl: `${uploadUrlPrefix}${file.filename}`,
        kind,
      });
    } catch (error) {
      await removeFile(file);
      return res.status(400).json({ error: error.message });
    }
  });
});

module.exports = router;
