// import express from 'express';
// import cors from 'cors';
// import dotenv from 'dotenv';
// import { v2 as cloudinary } from 'cloudinary';
// import multer from 'multer';
// import streamifier from 'streamifier';

// dotenv.config();

// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
//   secure: true
// });

// const app = express();
// const PORT = process.env.PORT || 3000;

// app.use(cors());
// app.use(express.json());
// app.use(express.static('public'));

// // Memory storage to avoid local disk usage
// const storage = multer.memoryStorage();
// const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } });

// // Upload Route
// app.post('/api/upload', upload.single('video'), async (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ success: false, message: 'No file' });

//     const title = req.body.title || 'Untitled';
//     const description = req.body.description || '';

//     const cld_upload_stream = cloudinary.uploader.upload_stream(
//       {
//         resource_type: "video",
//         folder: "video-streaming-app",
//         chunk_size: 6000000,
//         context: `title=${title}|description=${description}`,
//       },
//       (error, result) => {
//         if (result) res.json({ success: true, video: result });
//         else res.status(500).json({ success: false, message: error.message });
//       }
//     );

//     streamifier.createReadStream(req.file.buffer).pipe(cld_upload_stream);
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// // List Route
// app.get('/api/videos', async (req, res) => {
//   try {
//     const result = await cloudinary.api.resources({
//       type: 'upload', resource_type: 'video', prefix: 'video-streaming-app/', max_results: 100, context: true
//     });
//     const videos = result.resources.map(v => ({
//       id: v.public_id,
//       url: v.secure_url,
//       title: v.context?.custom?.title || v.public_id.split('/').pop(),
//       description: v.context?.custom?.description || '',
//       size: v.bytes,
//       uploadedAt: v.created_at
//     }));
//     res.json(videos);
//   } catch (err) {
//     res.status(500).json({ success: false });
//   }
// });

// // Delete Route
// app.delete('/api/videos/*', async (req, res) => {
//   try {
//     const result = await cloudinary.uploader.destroy(req.params[0], { resource_type: 'video', invalidate: true });
//     res.json({ success: true, result });
//   } catch (err) {
//     res.status(500).json({ success: false });
//   }
// });

// const server = app.listen(PORT, () => console.log(`🚀 NovaStream active at http://localhost:${PORT}`));
// server.timeout = 600000;
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

// --- AUTHORIZATION CONFIG ---
// --- AUTHORIZATION CONFIG ---
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(cookieParser());
// Serve static files but DON'T auto-serve index.html
app.use(express.static('public', { index: false }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// --- AUTH SHIELD (Middleware) ---
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

// Login Endpoint
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '30d' });
    
    // Set cookie for 1 month
    res.cookie('nova_auth', token, {
      httpOnly: true, // Prevents XSS attacks
      secure: true,   // Required for Render (HTTPS)
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
      sameSite: 'strict'
    });
    
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: "Unauthorized" });
});

// Logout Endpoint
app.get('/api/logout', (req, res) => {
  res.clearCookie('nova_auth');
  res.redirect('/login.html');
});

// --- PROTECTED CONTENT ROUTES ---

// Redirect root to index.html ONLY IF authorized
app.get('/', authShield, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Protect Video List
app.get('/api/videos', authShield, async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload', resource_type: 'video', prefix: 'video-streaming-app/', max_results: 100, context: true
    });
    const videos = result.resources.map(v => ({
      id: v.public_id,
      url: v.secure_url,
      title: v.context?.custom?.title || v.public_id.split('/').pop(),
      description: v.context?.custom?.description || '',
      size: v.bytes,
      uploadedAt: v.created_at
    }));
    res.json(videos);
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Protect Upload
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } });

app.post('/api/upload', authShield, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
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
// Add this right before the server.listen line
app.delete('/api/videos/*', authShield, async (req, res) => {
  try {
    // Cloudinary public_ids can contain slashes, req.params[0] captures the full path
    const publicId = req.params[0];
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video', invalidate: true });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});
const server = app.listen(PORT, () => console.log(`🚀 Secure NovaStream on Port ${PORT}`));
server.timeout = 600000;