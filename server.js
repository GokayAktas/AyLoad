const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const videoDownloader = require('./services/videoDownloader');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, 'downloads');
fs.ensureDirSync(downloadsDir);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'AyLoad Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Get video info endpoint (REAL)
app.get('/api/video-info', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    const info = await videoDownloader.getVideoInfo(url);
    res.json(info);
  } catch (error) {
    console.error('Error getting video info:', error);
    res.status(500).json({ error: error.message || 'Failed to get video information' });
  }
});

// Download video endpoint (REAL)
app.post('/api/download', async (req, res) => {
  try {
    const { url, format, quality, options } = req.body;
    if (!url || !format) {
      return res.status(400).json({ error: 'URL and format are required' });
    }
    const result = await videoDownloader.startDownload(url, format, quality, options || {});
    res.json({
      success: true,
      ...result,
      message: 'Download started successfully'
    });
  } catch (error) {
    console.error('Error downloading video:', error);
    res.status(500).json({ error: error.message || 'Failed to start download' });
  }
});

// Get download status endpoint (REAL)
app.get('/api/download/:downloadId/status', (req, res) => {
  try {
    const { downloadId } = req.params;
    const status = videoDownloader.getDownloadStatus(downloadId);
    if (!status) {
      return res.status(404).json({ error: 'Download not found' });
    }
    res.json(status);
  } catch (error) {
    console.error('Error getting download status:', error);
    res.status(500).json({ error: error.message || 'Failed to get download status' });
  }
});

// Download file endpoint (REAL)
app.get('/api/download/:downloadId/file', (req, res) => {
  try {
    const { downloadId } = req.params;
    const status = videoDownloader.getDownloadStatus(downloadId);
    if (!status || !status.filePath || status.status !== 'completed') {
      return res.status(404).json({ error: 'File not ready for download' });
    }
    if (fs.existsSync(status.filePath)) {
      res.download(status.filePath, (err) => {
        if (err) {
          console.error('Error downloading file:', err);
          res.status(500).json({ error: 'Failed to download file' });
        }
      });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: error.message || 'Failed to serve file' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AyLoad Backend running on port ${PORT}`);
  console.log(`📁 Downloads directory: ${downloadsDir}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
}); 
