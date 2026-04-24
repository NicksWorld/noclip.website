
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { readString } from "../../util.js";

function fetchDataSync(path: string): ArrayBufferSlice {
    const b: Buffer = readFileSync(path);
    return new ArrayBufferSlice(b.buffer, b.byteOffset, b.byteLength);
}

const pathBaseIn = `../../../data/Redline_raw`;
const pathBaseOut = `../../../data/Redline`;

export class ContentReader {
    public Position = 0;
    private view: DataView;

    constructor(private buffer: ArrayBufferSlice) {
        this.view = buffer.createDataView();
    }

    public readBytes(byteLength: number): ArrayBufferSlice {
        const v = this.buffer.subarray(this.Position, byteLength);
        this.Position += byteLength;
        return v;
    }

    public readUint32(): number {
        const v = this.view.getUint32(this.Position, true);
        this.Position += 4;
        return v;
    }

    public readByte(): number {
        const v = this.view.getUint8(this.Position);
        this.Position += 1;
        return v;
    }

    public readString(): string {
        const size =  this.readUint32();
        const str = readString(this.buffer, this.Position, size, false);
        this.Position += size;
        return str;
    }
}

type ArchiveEntry = {
    // Timestamp of creation in UTC
    _timestamp: number;
    // Size in bytes
    size: number;
    // Name of file
    filename: string;
};

function extractBgd(bgdPath: string, outPath: string): void {
    const buffer = fetchDataSync(bgdPath);
    const reader = new ContentReader(buffer);

    // Version number, always 2
    const _version = reader.readUint32();
    const numFiles = reader.readUint32();

    // Read table of contents
    const entries = new Array<ArchiveEntry>();
    for (let i = 0; i < numFiles; i++) {
        entries.push({
            _timestamp: reader.readUint32(),
            size: reader.readUint32(),
            filename: reader.readString(),
        });
    }

    // Extract all entries
    for (const entry of entries) {
        const data = reader.readBytes(entry.size);
        const dstPath = `${outPath}/${entry.filename.toLowerCase()}`;

        mkdirSync(path.dirname(dstPath), { recursive: true });
        writeFileSync(dstPath, Buffer.from(data.copyToBuffer()));
    }
}

async function main() {
    extractBgd(`${pathBaseIn}/Redline.bgd`, `${pathBaseOut}`);
    extractBgd(`${pathBaseIn}/Redline_Patch1.bgd`, `${pathBaseOut}`);
    extractBgd(`${pathBaseIn}/Arena.bgd`, `${pathBaseOut}/ArenaDemo`);
    extractBgd(`${pathBaseIn}/Redline_081.bgd`, `${pathBaseOut}/demo_081`);
    extractBgd(`${pathBaseIn}/Redline_090.bgd`, `${pathBaseOut}/demo_090`);
    extractBgd(`${pathBaseIn}/Arena.bgd`, `${pathBaseOut}/ArenaDemo`);
}

main();
