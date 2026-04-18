const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || './downloads';
const OUTPUT_DIR = process.env.OUTPUT_DIR || './branded';
const LOGO_PATH = process.env.LOGO_PATH || './logo.png';

const LOGO_POSITION = process.env.LOGO_POSITION || 'bottomright';
const LOGO_SCALE = process.env.LOGO_SCALE || '120';
const MARGIN = 20;

const positions = {
  bottomright: `main_w-overlay_w-${MARGIN}:main_h-overlay_h-${MARGIN}`,
  bottomleft:  `${MARGIN}:main_h-overlay_h-${MARGIN}`,
  topright:    `main_w-overlay_w-${MARGIN}:${MARGIN}`,
  topleft:     `${MARGIN}:${MARGIN}`,
  center:      `(main_w-overlay_w)/2:(main_h-overlay_h)/2`,
};

// Probe video to check if it has audio
function hasAudioStream(inputPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return resolve(false);
      const audio = metadata.streams.find(s => s.codec_type === 'audio');
      resolve(!!audio);
    });
  });
}

async function addLogo(inputPath, outputPath) {
  const pos = positions[LOGO_POSITION] || positions.bottomright;
  const hasAudio = await hasAudioStream(inputPath);

  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath).input(LOGO_PATH);

    // If no audio, add silent audio track (Instagram prefers audio present)
    if (!hasAudio) {
      command.input('anullsrc=channel_layout=stereo:sample_rate=44100')
             .inputOptions(['-f lavfi']);
    }

    // Use CROP instead of PAD to avoid black bars (Instagram dislikes letterboxing)
    // scale to cover 1080x1920, then center-crop
    const filters = [
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[scaled]`,
      `[1:v]scale=${LOGO_SCALE}:-1[logo]`,
      `[scaled][logo]overlay=${pos}:format=auto,format=yuv420p[out]`
    ];

    const outputOpts = [
      '-map', '[out]',
      '-map', hasAudio ? '0:a:0' : '2:a:0',
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-level', '4.0',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '21',
      '-b:v', '5000k',
      '-maxrate', '5000k',
      '-bufsize', '10000k',
      '-r', '30',
      '-g', '60',              // keyframe every 2 sec at 30fps
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-shortest',             // match duration to shortest stream (video)
      '-movflags', '+faststart',
      '-f', 'mp4'
    ];

    command
      .complexFilter(filters)
      .outputOptions(outputOpts)
      .output(outputPath)
      .on('start', (cmd) => console.log(`   ▶ ffmpeg: ${cmd.substring(0, 200)}...`))
      .on('end', () => {
        console.log(`✅ Logo added: ${path.basename(outputPath)}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`❌ ffmpeg error: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

async function processBrandedReels() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = fs.readdirSync(DOWNLOAD_DIR)
    .filter(f => f.endsWith('.mp4') || f.endsWith('.mov'));

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
    try {
      await addLogo(inputPath, outputPath);
    } catch (err) {
      console.error(`Failed for ${file}:`, err.message);
    }
  }

  console.log('✅ Branding complete!');
}

module.exports = { processBrandedReels };

if (require.main === module) processBrandedReels();