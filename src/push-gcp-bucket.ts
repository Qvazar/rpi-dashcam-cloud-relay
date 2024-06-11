import 'dotenv/config';
import { isEmpty } from "./lib/util.js";
import { logger } from "./lib/logger.js";
import { useWifi } from "./lib/wifi.js";
import { uploadFiles } from './lib/gcp-bucket.js';
import { fileStorage } from './lib/file-storage.js';

const CAMERA_SSID = process.env.CAMERA_SSID;
const HEARTBEAT_DELTA = 30*1000; // 30 seconds

if (isEmpty(CAMERA_SSID)) {
    logger.error("CAMERA_SSID not set.")
    process.exit(1);
}

// main
(async () => {
    const l = logger.child({function:"main"});
    let heartbeatTimeout:NodeJS.Timeout|null = null;

    await useWifi(async (wifi) => {
        wifi.onConnect(ws => {
            onConnectedToInternet();
        });

        wifi.onDisconnect(() => {
            if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
                heartbeatTimeout = null;
            }
        });

        // in case wifi is already connected at startup
        onConnectedToInternet();


        async function onConnectedToInternet() {
            if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
                heartbeatTimeout = null;
            }

            const ssid = await wifi.currentSsid();
            if (ssid === CAMERA_SSID) {
                return;
            }

            try {
                const videos = await fileStorage.loadVideos();
                await uploadFiles(videos.map(v => v.path), (fileProgress) => {
                    if (fileProgress.err) {
                        l.error(fileProgress, "Error uploading video to GCP Bucket.");
                    } else {
                        fileStorage.deleteVideo(fileProgress.name);
                    }
                });
            } catch (err) {
                l.error({err}, "Error uploading videos to GCP Bucket.");
            } finally {
                heartbeatTimeout = setTimeout(onConnectedToInternet, HEARTBEAT_DELTA);
            }
        }
    });
})();