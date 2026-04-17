const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || './downloads';
const OUTPUT_DIR = process.env.OUTPUT_DIR || './branded';
const LOGO_PATH = process.env.LOGO_PATH || './logo.jpeg';

// Position: 'bottomright' | 'bottomleft' | 'topright' | 'topleft' | 'center'
const LOGO_POSITION = process.env.LOGO_POSITION || 'bottomright';
const LOGO_SCALE = process.env.LOGO_SCALE || '120'; // width in pixels
const MARGIN = 20;

const positions = {
  bottomright: `main_w-overlay_w-${MARGIN}:main_h-overlay_h-${MARGIN}`,
  bottomleft:  `${MARGIN}:main_h-overlay_h-${MARGIN}`,
  topright:    `main_w-overlay_w-${MARGIN}:${MARGIN}`,
  topleft:     `${MARGIN}:${MARGIN}`,
  center:      `(main_w-overlay_w)/2:(main_h-overlay_h)/2`,
};

function addLogo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const pos = positions[LOGO_POSITION] || positions.bottomright;

    ffmpeg(inputPath)
      .input(LOGO_PATH)
      .complexFilter([
        `[1:v]scale=${LOGO_SCALE}:-1[logo]`,
        `[0:v][logo]overlay=${pos}[out]`
      ])
      .outputOptions(['-map [out]', '-map 0:a?', '-c:v libx264', '-c:a copy', '-preset fast', '-crf 23'])
      .output(outputPath)
      .on('end', () => {
        console.log(`✅ Logo added: ${path.basename(outputPath)}`);
        resolve(outputPath);
      })
      .on('error', reject)
      .run();
  });
}

async function processBrandedReels() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.mp4') || f.endsWith('.mov'));

  if (files.length === 0) {
    console.log('No downloaded reels to brand.');
    return;
  }

  for (const file of files) {
    const inputPath = path.join(DOWNLOAD_DIR, file);
    const outputPath = path.join(OUTPUT_DIR, file.replace(/\.(mp4|mov)$/, '_branded.mp4'));

    if (fs.existsSync(outputPath)) {
      console.log(`⏭️  Already branded: ${file}`);
      continue;
    }

    console.log(`🎨 Adding logo to: ${file}`);
    await addLogo(inputPath, outputPath).catch(console.error);
  }

  console.log('✅ Branding complete!');
}

processBrandedReels();
