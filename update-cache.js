const fetch = require('node-fetch');
const fs = require('fs').promises;

// --- Configuration ---
// These will be read from GitHub Actions secrets
const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const MAX_RESULTS = 50; // Max results per API call

/**
 * Fetches recent activities from the channel to get video IDs.
 */
async function getActivityVideoIds() {
  const url = `https://www.googleapis.com/youtube/v3/activities?part=contentDetails&channelId=${CHANNEL_ID}&maxResults=${MAX_RESULTS}&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error (activities.list): ${res.status} ${await res.text()}`);
  const data = await res.json();

  // --- DEBUGGING: Log the entire raw response from the API ---
  console.log("--- Raw API Response from activities.list ---");
  console.log(JSON.stringify(data, null, 2));

  // Filter for upload activities and extract video IDs
  const videoIds = data.items
    .filter(item => item.contentDetails && item.contentDetails.upload)
    .map(item => item.contentDetails.upload.videoId);
  
  console.log(`--- Extracted ${videoIds.length} video IDs from the activity feed ---`);
  return videoIds;
}

/**
 * Fetches detailed video information for a list of video IDs.
 */
async function getVideoDetails(videoIds) {
  if (videoIds.length === 0) return [];
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${videoIds.join(',')}&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error (videos.list): ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.items || [];
}

/**
 * Writes data to a JSON file.
 */
async function writeCacheFile(filename, videos) {
  const data = {
    items: videos,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(filename, JSON.stringify(data, null, 2));
  console.log(`Successfully wrote ${videos.length} videos to ${filename}`);
}

/**
 * Main function to run the cache update process.
 */
async function updateCache() {
  if (!API_KEY || !CHANNEL_ID) {
    throw new Error("YOUTUBE_API_KEY or YOUTUBE_CHANNEL_ID is not set in environment variables.");
  }

  console.log("Starting YouTube cache update...");

  const videoIds = await getActivityVideoIds();
  if (videoIds.length === 0) {
    console.log("No recent video activities found.");
    return;
  }

  const videos = await getVideoDetails(videoIds);

  // --- Sort videos into categories ---
  const upcoming = [];
  const live = [];
  const past = [];

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  videos.forEach(video => {
    const details = video.liveStreamingDetails;
    if (details) {
      if (details.actualStartTime && !details.actualEndTime) {
        live.push(video); // Currently live
      } else if (details.scheduledStartTime && !details.actualStartTime) {
        upcoming.push(video); // Scheduled but not started
      } else if (details.actualEndTime) {
        // Completed stream, check if it was in the last 7 days
        if (new Date(details.actualEndTime) > sevenDaysAgo) {
          past.push(video);
        }
      }
    }
  });

  // Sort by date (newest first)
  upcoming.sort((a, b) => new Date(b.liveStreamingDetails.scheduledStartTime) - new Date(a.liveStreamingDetails.scheduledStartTime));
  live.sort((a, b) => new Date(b.liveStreamingDetails.actualStartTime) - new Date(a.liveStreamingDetails.actualStartTime));
  past.sort((a, b) => new Date(b.liveStreamingDetails.actualEndTime) - new Date(a.liveStreamingDetails.actualEndTime));

  // --- Write cache files ---
  await writeCacheFile('upcoming_cache.json', upcoming);
  await writeCacheFile('live_cache.json', live);
  await writeCacheFile('past_week_cache.json', past);

  console.log("YouTube cache update finished successfully.");
}

updateCache().catch(err => console.error(err));