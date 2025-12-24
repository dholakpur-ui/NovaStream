// import express from 'express';
// import cors from 'cors';
// import dotenv from 'dotenv';
// import { v2 as cloudinary } from 'cloudinary';
// import multer from 'multer';
// import streamifier from 'streamifier'; // Install this: npm install streamifier

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

// /* ===================== MEMORY STORAGE (No Local Files) ===================== */
// const storage = multer.memoryStorage();
// const upload = multer({ 
//   storage: storage,
//   limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
// });

// /* ===================== ROUTES ===================== */

// app.post('/api/upload', upload.single('video'), async (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ success: false, message: 'No file' });

//     const title = req.body.title || 'Untitled';
//     const description = req.body.description || '';

//     // Create a Cloudinary upload stream
//     const cld_upload_stream = cloudinary.uploader.upload_stream(
//       {
//         resource_type: "video",
//         folder: "video-streaming-app",
//         chunk_size: 6000000,
//         context: `title=${title}|description=${description}`,
//       },
//       (error, result) => {
//         if (result) {
//           res.json({ success: true, video: result });
//         } else {
//           res.status(500).json({ success: false, message: error.message });
//         }
//       }
//     );

//     // Stream the file buffer from memory directly to Cloudinary
//     streamifier.createReadStream(req.file.buffer).pipe(cld_upload_stream);

//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// // List videos
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

// // Delete
// app.delete('/api/videos/*', async (req, res) => {
//   try {
//     const publicId = req.params[0];
//     const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video', invalidate: true });
//     res.json({ success: true, result });
//   } catch (err) {
//     res.status(500).json({ success: false });
//   }
// });

// app.listen(PORT, () => console.log(`🚀 Streaming Server on http://localhost:${PORT}`));
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import streamifier from 'streamifier';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Memory storage to avoid local disk usage
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } });

// Upload Route
app.post('/api/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file' });

    const title = req.body.title || 'Untitled';
    const description = req.body.description || '';

    const cld_upload_stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder: "video-streaming-app",
        chunk_size: 6000000,
        context: `title=${title}|description=${description}`,
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

// List Route
app.get('/api/videos', async (req, res) => {
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

// Delete Route
app.delete('/api/videos/*', async (req, res) => {
  try {
    const result = await cloudinary.uploader.destroy(req.params[0], { resource_type: 'video', invalidate: true });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

const server = app.listen(PORT, () => console.log(`🚀 NovaStream active at http://localhost:${PORT}`));
server.timeout = 600000;