import { Blob } from 'buffer';
import { Readable } from "stream";
import { auth as g_auth } from "@googleapis/oauth2";
import { drive_v3, drive as g_drive } from "@googleapis/drive";
import moment, { Moment } from "moment";
import { GaxiosResponse } from "gaxios";
import { retry } from './util.js';

// const VIDEO_MIMETYPE = "video/mp2t";

const drive = g_drive({
    version: "v3",
    auth: new g_auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/drive']
    })
});

export interface GoogleDriveFileMeta {
    name: string,
    mimetype: string|null|undefined,
    timestamp: Moment|null|undefined
}

export class GoogleDriveFolder {
    private _parentFolderId: string | undefined;

    /**
     *
     */
    constructor(parentFolderId?:string) {
        this._parentFolderId = parentFolderId;
    }

    getFolder(folderId?:string) {
        return new GoogleDriveFolder(folderId);
    }

    async upload(file: GoogleDriveFileMeta, blob: Blob) {
        await retry(async () => checkStatus(await drive.files.create({
            requestBody: {
                name: file.name,
                mimeType: file.mimetype,
                parents: this._parentFolderId ? [this._parentFolderId] : undefined,
                createdTime: file.timestamp?.toISOString()
            },
            media: {
                mimeType: file.mimetype || undefined,
                body: Readable.from(blob.stream())
            }
        })));
    }

    async list() {
        let files:Array<GoogleDriveFileMeta> = [];
        let nextPageToken:string|null|undefined = undefined;

        do {
            let res = await retry(async () => {
                return checkStatus(await drive.files.list({
                    q: (this._parentFolderId ? `'${this._parentFolderId}' in parents` : undefined),
                    fields: 'files(name,mimeType,createdTime)',
                    pageToken: nextPageToken
                } as drive_v3.Params$Resource$Files$List));
            });

            if (res.data.files) {
                files.push(...res.data.files.map<GoogleDriveFileMeta>(f => ({
                    name: f.name!,
                    mimetype: f.mimeType,
                    timestamp: f.createdTime ? moment(f.createdTime) : undefined
                })));
            }
            
            nextPageToken = res.data.nextPageToken;
        } while (nextPageToken);

        return files;
    }
}

export const googleDrive = new GoogleDriveFolder();

class GoogleDriveResponseError<T> extends Error {
    response: GaxiosResponse<T>;

	constructor(response:GaxiosResponse<T>) {
		super(`Google Drive HTTP Error Response: ${response.status} ${response.statusText}`);
		this.response = response;
	}
}

function checkStatus<T>(response : GaxiosResponse<T>) : GaxiosResponse<T> {
	if (response.status >= 200 && response.status < 300) {
		return response;
	} else {
		throw new GoogleDriveResponseError(response);
	}
}
