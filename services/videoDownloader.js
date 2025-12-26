const ytdl = require('ytdl-core');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const downloadsDir = path.join(__dirname, '../downloads');
const downloadStates = new Map();

const getVideoInfo = async (url) => {
  try {
    if (!url) {
      throw new Error('URL parameter is required');
    }

    const videoId = ytdl.getVideoID(url);
    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;

    const formats = [];

    const videoFormats = ytdl.filterByContainer(info.formats, 'mp4');
    const uniqueQualities = new Set();

    videoFormats.forEach(format => {
      if (format.qualityLabel && !uniqueQualities.has(format.qualityLabel)) {
        uniqueQualities.add(format.qualityLabel);
        formats.push({
          format: 'MP4',
          quality: format.qualityLabel,
          size: format.contentLength ? `${Math.round(parseInt(format.contentLength) / (1024 * 1024))} MB` : 'Unknown',
          type: 'video'
        });
      }
    });

    if (uniqueQualities.size === 0) {
      const bestFormat = ytdl.chooseFormat(info.formats, { quality: 'highest' });
      if (bestFormat) {
        formats.push({
          format: 'MP4',
          quality: bestFormat.qualityLabel || '360p',
          size: bestFormat.contentLength ? `${Math.round(parseInt(bestFormat.contentLength) / (1024 * 1024))} MB` : 'Unknown',
          type: 'video'
        });
      }
    }


    return {
      title: videoDetails.title,
      thumbnail: videoDetails.thumbnails[videoDetails.thumbnails.length - 1]?.url || 'https://via.placeholder.com/400x225',
      duration: videoDetails.lengthSeconds ? `${Math.floor(videoDetails.lengthSeconds / 60)}:${String(videoDetails.lengthSeconds % 60).padStart(2, '0')}` : 'Unknown',
      formats: formats.slice(0, 4)
    };
  } catch (error) {
    console.error('Error getting video info:', error);
    throw new Error(`Failed to get video information: ${error.message}`);
  }
};

const startDownload = async (url, format, quality, options = {}) => {
  const downloadId = uuidv4();

  try {
    if (!url || !format) {
      throw new Error('URL and format are required');
    }

    downloadStates.set(downloadId, {
      id: downloadId,
      url: url,
      format: format,
      quality: quality,
      status: 'processing',
      progress: 0,
      filePath: null,
      error: null,
      startTime: new Date()
    });

    (async () => {
      try {
        const info = await ytdl.getInfo(url);
        const videoDetails = info.videoDetails;
        const filename = `${videoDetails.videoId}_${format.toLowerCase()}_${Date.now()}`;
        const outputPath = path.join(downloadsDir, filename);

        downloadStates.get(downloadId).status = 'downloading';

        if (format.toUpperCase() === 'MP4') {
          const chosen = ytdl.chooseFormat(info.formats, {
            quality: quality.includes('p') ? parseInt(quality) : 'highest',
            filter: 'videoandaudio'
          });

          const stream = ytdl(url, { format: chosen });

          stream.on('info', (info, format) => {
            const size = format.contentLength;
            downloadStates.get(downloadId).totalSize = size;
          });

          stream.on('progress', (chunkLength, downloaded, total) => {
            const progress = Math.round((downloaded / total) * 100);
            downloadStates.get(downloadId).progress = progress;
          });

          stream.pipe(fs.createWriteStream(outputPath + '.mp4'));

          await new Promise((resolve, reject) => {
            stream.on('end', resolve);
            stream.on('error', reject);
          });

          downloadStates.get(downloadId).filePath = outputPath + '.mp4';
          downloadStates.get(downloadId).status = 'completed';
        }
      } catch (error) {
        console.error('Download error:', error);
        downloadStates.get(downloadId).status = 'failed';
        downloadStates.get(downloadId).error = error.message;
      }
    })();

    return {
      downloadId: downloadId,
      status: 'started'
    };
  } catch (error) {
    downloadStates.get(downloadId).status = 'failed';
    downloadStates.get(downloadId).error = error.message;
    throw error;
  }
};

const getDownloadStatus = (downloadId) => {
  return downloadStates.get(downloadId) || null;
};

module.exports = {
  getVideoInfo,
  startDownload,
  getDownloadStatus
};
