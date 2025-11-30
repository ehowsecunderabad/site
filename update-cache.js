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
  console.log(`\n--- Processing ${videos.length} videos for categorization ---`);

  // --- Sort videos into categories ---
  const upcoming = [];
  const live = [];
  const past = [];
  let noDetails = 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  videos.forEach(video => {
    const details = video.liveStreamingDetails;
    if (!details) {
      noDetails++;
      return;
    }

    const hasActualStart = !!details.actualStartTime;
    const hasActualEnd = !!details.actualEndTime;
    const hasScheduled = !!details.scheduledStartTime;

    if (hasActualStart && !hasActualEnd) {
      live.push(video); // Currently live
      console.log(`  [LIVE] ${video.snippet.title} (started: ${details.actualStartTime})`);
    } else if (hasScheduled && !hasActualStart) {
      upcoming.push(video); // Scheduled but not started
      console.log(`  [UPCOMING] ${video.snippet.title} (scheduled: ${details.scheduledStartTime})`);
    } else if (hasActualEnd) {
      // Completed stream, check if it was in the last 7 days
      const endTime = new Date(details.actualEndTime);
      if (endTime > sevenDaysAgo) {
        past.push(video);
        console.log(`  [PAST] ${video.snippet.title} (ended: ${details.actualEndTime})`);
      } else {
        console.log(`  [SKIPPED - OLDER] ${video.snippet.title} (ended: ${details.actualEndTime}, older than 7 days)`);
      }
    } else {
      console.log(`  [SKIPPED - NO MATCH] ${video.snippet.title} (actual_start=${hasActualStart}, actual_end=${hasActualEnd}, scheduled=${hasScheduled})`);
    }
  });

  // Sort by date (newest first)
  upcoming.sort((a, b) => new Date(b.liveStreamingDetails.scheduledStartTime) - new Date(a.liveStreamingDetails.scheduledStartTime));
  live.sort((a, b) => new Date(b.liveStreamingDetails.actualStartTime) - new Date(a.liveStreamingDetails.actualStartTime));
  past.sort((a, b) => new Date(b.liveStreamingDetails.actualEndTime) - new Date(a.liveStreamingDetails.actualEndTime));

  // --- Summary ---
  console.log(`\n--- Categorization Summary ---`);
  console.log(`  Live streams (actualStart, no end): ${live.length}`);
  console.log(`  Upcoming streams (scheduled, no start): ${upcoming.length}`);
  console.log(`  Past week streams (with end time): ${past.length}`);
  console.log(`  Skipped (no liveStreamingDetails): ${noDetails}`);
  console.log(`  Total processed: ${live.length + upcoming.length + past.length + noDetails}/${videos.length}`);
  console.log(`  Reference time (7 days ago): ${sevenDaysAgo.toISOString()}\n`);

  // --- Write cache files ---
  await writeCacheFile('upcoming_cache.json', upcoming);
  await writeCacheFile('live_cache.json', live);
  await writeCacheFile('past_week_cache.json', past);

  console.log("YouTube cache update finished successfully.");
}

updateCache().catch(err => console.error(err));