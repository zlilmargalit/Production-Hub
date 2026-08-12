// Receipt images — administration workspaces only.
//
// Receipts are stored as FILES on the volume, and the JSON keeps only a URL.
// The tempting alternative — a base64 data-URL inside projects.json — is a
// mistake this codebase has already made: a single 1.28MB PDF base64'd into
// shows.json is still there, and every read and write of that file carries it.
// A stylist photographs a receipt per purchase, so that would compound fast.
//
// Files live under the same scoped directory as the workspace's JSON, via
// dataPath(), so one workspace can never read another's receipts.

const express = require('express');
const path    = require('path');
const fsp     = require('fs').promises;
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');

const { dataPath } = require('../utils/userData');
const { requireAdministrationWorkspace } = require('../utils/adminGuard');

router.use(requireAdministrationWorkspace);

// Closed set. The extension is chosen from the declared mime type, never from
// anything the client names the file — a client-supplied filename is how you
// end up writing `../../users/someone/clients.json`.
const EXT_FOR_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

// Generated names only: a uuid plus one of the extensions above. Anything else
// never reaches the filesystem.
const SAFE_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

const MAX_BYTES = 8 * 1024 * 1024;

const dirFor = (userId) => dataPath(userId, 'receipts');

router.post('/', async (req, res, next) => {
  try {
    const { dataUrl } = req.body || {};
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return res.status(400).json({ error: 'Expected a data URL' });
    }
    const match = dataUrl.match(/^data:([^;,]+)[^,]*,(.*)$/s);
    if (!match) return res.status(400).json({ error: 'Malformed data URL' });

    const [, mime, base64] = match;
    const ext = EXT_FOR_MIME[mime.toLowerCase()];
    if (!ext) {
      return res.status(400).json({ error: 'Receipts must be a JPEG, PNG, WebP or PDF' });
    }

    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'Empty file' });
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: 'That file is too large — 8MB is the limit' });
    }

    const dir = dirFor(req.userId);
    await fsp.mkdir(dir, { recursive: true });
    const name = `${uuidv4()}.${ext}`;
    await fsp.writeFile(path.join(dir, name), buffer);

    // Relative and scope-free: the workspace comes from the caller's session and
    // ?artistId= on the way back out, never from the stored string.
    res.status(201).json({ url: `/api/receipts/${name}`, bytes: buffer.length });
  } catch (err) { next(err); }
});

router.get('/:name', async (req, res, next) => {
  try {
    const { name } = req.params;
    if (!SAFE_NAME.test(name)) return res.status(404).json({ error: 'Not found' });

    const file = path.join(dirFor(req.userId), name);
    // Belt and braces: even with the pattern above, never serve a resolved path
    // that escaped the scoped directory.
    if (!path.resolve(file).startsWith(path.resolve(dirFor(req.userId)))) {
      return res.status(404).json({ error: 'Not found' });
    }
    const stat = await fsp.stat(file).catch(() => null);
    if (!stat) return res.status(404).json({ error: 'Not found' });

    res.type(path.extname(name));
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(path.resolve(file));
  } catch (err) { next(err); }
});

module.exports = router;
