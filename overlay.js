const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

const LOGO_PATH = './assets/logo.png';

function addLogoOverlay(inputPath, outputPath, position = 'bottom-right') {
  const overlayMap = {
    'top-left':     'overlay=20:20',
    'top-right':    'overlay=W-w-20:20',
    'bottom-left':  'overlay=20:H-h-20',
    'bottom-right': 'overlay=W-w-20:H-h-20',
    'center':       'overlay=(W-w)/2:(H-h)/2',
  };

  const overlayFilter = overlayMap[position] || overlayMap['bottom-right'];

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .input(LOGO_PATH)
      .complexFilter([
        // Scale logo to 15% of video width, then overlay
        `[1:v]scale=iw*0.15:-1[logo];[0:v][logo]${overlayFilter}[out]`
      ])
      .outputOptions(['-map [out]', '-map 0:a?', '-c:v libx264', '-c:a copy', '-crf 18'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

module.exports = { addLogoOverlay };