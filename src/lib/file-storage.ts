import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { logger } from "./logger.js";

const TMPDIR = process.env.TMPDIR ?? "/tmp/";
const VIDEO_TRANSFER_PATH = path.normalize(process.env.VIDEO_TRANSFER_PATH ?? path.join(TMPDIR, "rpi-dashcam-fetch-fitcamx/"));
const STORAGE_HISTORY_PATH = path.join(VIDEO_TRANSFER_PATH, ".fetch_history");
const VIDEO_TRANSFER_LIMIT = Number.parseInt(process.env.VIDEO_TRANSFER_LIMIT ?? "80");

const log = logger.child({module:"file-storage"});


// try to create video transfer directory
try {
    await fs.mkdir(VIDEO_TRANSFER_PATH, { recursive: true });
} catch (err) {
    log.error({dir:VIDEO_TRANSFER_PATH}, "Could not create transfer directory.");
    process.exit(2);
}

const STORAGE_HISTORY_FILE = fs.open(STORAGE_HISTORY_PATH, 'a+');

async function writeStorageHistory(s:string) {
    await (await STORAGE_HISTORY_FILE).writeFile(s, "utf8");
}

async function readStorageHistory() {
    return (await STORAGE_HISTORY_FILE).readFile("utf8");
}

async function checkTransferDirectory() {
    const files = await fs.readdir(VIDEO_TRANSFER_PATH);
    if (files.length < VIDEO_TRANSFER_LIMIT) {
        throw new Error("VIDEO_TRANSFER_LIMIT exceeded!");
    }
}

async function storeVideo(name:string, stream:Readable) {
    await checkTransferDirectory();
    const l = log.child({function:storeVideo.name});

    const lastStoredFilename:string = await readStorageHistory();

    if (name < lastStoredFilename) {
        l.warn({filename:name}, "Already stored newer video file, file skipped.");
        return;
    }

    l.debug({filename: name}, "Writing file.");
    let filePath = path.join(VIDEO_TRANSFER_PATH, name);
    try {
        await fs.writeFile(filePath, stream);
        await writeStorageHistory(name);
        log.info({filePath}, "Wrote file.");
    }
    catch (err) {
        log.error({err, filePath}, "Error writing file!");
        await fs.rm(filePath, {force:true});

        throw err;
    }
}

interface FileWithStream {
    path: string,
    name: string,
    getStream: () => Promise<Readable>,
    delete: () => Promise<void>
}

async function loadVideos() {
    const filenames = await fs.readdir(VIDEO_TRANSFER_PATH);
    const files:FileWithStream[] = [];

    filenames.forEach(fn => {
        if (fn.startsWith(".")) {
            return;
        }

        const p = path.join(VIDEO_TRANSFER_PATH, fn);
        let videoFile:FileWithStream = {
            path: p,
            name: fn,
            getStream: async () => {
                const file = await fs.open(p, "r");
                return file.createReadStream({autoClose:true});        
            },
            delete: () => fs.rm(p, {force:false})
        };

        files.push(videoFile);
    });

    return files;
}

async function deleteVideo(name:string) {
    return fs.rm(path.join(VIDEO_TRANSFER_PATH, name), {force:false});
}

export const fileStorage = {
    deleteVideo,
    loadVideos,
    storeVideo
};