const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const IG_USER_ID = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const BASE_URL = `https://graph.facebook.com/v19.0`;

// Step 1: Upload video and create a media container
async function createMediaContainer(videoUrl, caption) {
  const res = await axios.post(`${BASE_URL}/${IG_USER_ID}/media`, {
    media_type: 'REELS',
    video_url: videoUrl,  // Must be a public URL (use your server or a free host)
    caption: caption,
    share_to_feed: true,
    access_token: IG_ACCESS_TOKEN,
  });
  return res.data.id; // container ID
}

// Step 2: Wait for video to be processed by Meta
async function waitForContainer(containerId, maxRetries = 15) {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, 10000)); // wait 10 seconds
    const res = await axios.get(`${BASE_URL}/${containerId}`, {
      params: { fields: 'status_code', access_token: IG_ACCESS_TOKEN }
    });
    if (res.data.status_code === 'FINISHED') return true;
    if (res.data.status_code === 'ERROR') throw new Error('Container processing failed');
  }
  throw new Error('Timed out waiting for container');
}

// Step 3: Publish
async function publishContainer(containerId) {
  const res = await axios.post(`${BASE_URL}/${IG_USER_ID}/media_publish`, {
    creation_id: containerId,
    access_token: IG_ACCESS_TOKEN,
  });
  return res.data.id;
}

async function postReel(videoUrl, caption) {
  console.log('Creating media container...');
  const containerId = await createMediaContainer(videoUrl, caption);
  console.log('Waiting for Meta to process video...');
  await waitForContainer(containerId);
  console.log('Publishing...');
  const postId = await publishContainer(containerId);
  return postId;
}

module.exports = { postReel };