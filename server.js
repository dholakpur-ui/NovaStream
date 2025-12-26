import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import streamifier from 'streamifier';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public', { index: false }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// --- AUTH SHIELD ---
const authShield = (req, res, next) => {
  const token = req.cookies.nova_auth;
  if (!token) return res.redirect('/login.html');
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.redirect('/login.html');
  }
};

// --- AUTH ROUTES ---
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('nova_auth', token, {
      httpOnly: true,
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, 
      sameSite: 'strict'
    });
    return res.json({ success: true });
  }
  res.status(401).json({ success: false });
});

app.get('/api/logout', (req, res) => {
  res.clearCookie('nova_auth');
  res.redirect('/login.html');
});

// --- CONTENT ROUTES ---

app.get('/', authShield, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// List Videos (Optimized with Playlist & ThumbTime)
app.get('/api/videos', authShield, async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload', 
      resource_type: 'video', 
      prefix: 'video-streaming-app/', 
      max_results: 100, 
      context: true, 
      tags: true
    });
    
    const videos = result.resources.map(v => ({
      id: v.public_id,
      url: v.secure_url,
      title: v.context?.custom?.title || v.public_id.split('/').pop(),
      description: v.context?.custom?.description || '',
      thumbTime: v.context?.custom?.thumbTime || "0.5", 
      playlist: v.tags?.[0] || "General",
      size: v.bytes,
      uploadedAt: v.created_at
    }));
    res.json(videos);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Update Video Metadata (Thumb & Playlist)
app.post('/api/videos/:id/update', authShield, async (req, res) => {
  try {
    const { thumbTime, playlist } = req.body;
    const publicId = decodeURIComponent(req.params.id);
    
    await cloudinary.api.update(publicId, {
      context: `thumbTime=${thumbTime || "0.5"}|playlist=${playlist || "none"}`,
      tags: [playlist || "General"]
    });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } });

app.post('/api/upload', authShield, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false });
    const cld_upload_stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder: "video-streaming-app",
        context: `title=${req.body.title || 'Untitled'}|description=${req.body.description || ''}`,
      },
      (error, result) => {
        if (result) res.json({ success: true, video: result });
        else res.status(500).json({ success: false, message: error.message });
      }
    );
    streamifier.createReadStream(req.file.buffer).pipe(cld_upload_stream);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/videos/*', authShield, async (req, res) => {
  try {
    const publicId = req.params[0];
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video', invalidate: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

const server = app.listen(PORT, () => console.log(`🚀 Secure NovaStream on Port ${PORT}`));
server.timeout = 600000;