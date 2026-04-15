
import { pathBase } from "./Scenes";
import { GfxDevice, GfxTexture, GfxTextureUsage, GfxFormat, makeTextureDescriptor2D } from "../gfx/platform/GfxPlatform";
import ArrayBufferSlice from "../ArrayBufferSlice";
import { SceneContext } from "../SceneBase";

class Cursor {
    public Position = 0;
    private view: DataView;

    constructor(private buffer: ArrayBufferSlice) {
        this.view = buffer.createDataView();
    }

    public readUint16(): number {
        const v = this.view.getUint16(this.Position, true);
        this.Position += 2;
        return v;
    }
    
    public readUint8(): number {
        const v = this.view.getUint8(this.Position)
        this.Position += 1;
        return v;
    }

    public readSlice(len: number): ArrayBufferSlice {
        const v = this.buffer.subarray(this.Position, len);
        this.Position += len;
        return v;
    }
}

export class Texture {
    public gfxTexture: GfxTexture;

    constructor(public name: string, device: GfxDevice, raw: ArrayBufferSlice) {
        const r = new Cursor(raw);
        const _version = r.readUint16(); // Always 2
        const height = r.readUint16();
        const width = r.readUint16();
        const bpp = r.readUint16();
        const _unk = r.readUint16();
        let mips = r.readUint16();

        if (mips == 0 || _unk != 256) {
            mips = 1; // Mip reading is broken when _unk isn't 256
        }

        const palette = [];
        if (bpp == 8) { // Uses palette
            for (let i = 0; i < 256; i++) {
                // Convert to RGB
                const blue = r.readUint8();
                const green = r.readUint8();
                const red = r.readUint8();
                palette.push([red, green, blue]);
            }
        }

        const levels = [];

        // Store converted texture data into buffer
        for (let i = 0; i < mips; i++) {
            let mip_width = width >> i;
            let mip_height = height >> i;

            let size = (bpp / 8) * mip_width * mip_height;

            if (name == "railbtm2.tga") continue;
            let buffer = new Uint8Array(mip_width * mip_height * (bpp == 32 ? 4 : 3));
            let slice = r.readSlice(size).createTypedArray(Uint8Array);

            for (let x = 0; x < mip_width; x++) {
                for (let y = 0; y < mip_height; y++) {
                    let ry = mip_height - y - 1;
                    let offset = (bpp / 8) * ((ry * mip_width) + x);
                    let out_offset = ((ry * mip_width) + x) * (bpp == 32 ? 4 : 3);

                    if (bpp == 8) {
                        const color = palette[slice[offset]];
                        buffer[out_offset] = color[0];
                        buffer[out_offset + 1] = color[1];
                        buffer[out_offset + 2] = color[2];
                    } else {
                        buffer[out_offset] = slice[offset];
                        buffer[out_offset + 1] = slice[offset + 1];
                        buffer[out_offset + 2] = slice[offset + 2];
                        if (bpp == 32) {
                            buffer[out_offset + 3] = slice[offset + 3];
                        }
                    }
                }
            }

            levels.push(buffer);
        }
        
        const fmt = bpp == 32 ? GfxFormat.U8_RGBA_NORM : GfxFormat.U8_RGB_NORM;
        const desc = makeTextureDescriptor2D(fmt, width, height, mips);
        desc.usage |= GfxTextureUsage.RenderTarget;
        this.gfxTexture = device.createTexture(desc);
        device.uploadTextureData(this.gfxTexture, 0, levels);
        device.setResourceName(this.gfxTexture, name);
    }

    public destroy(device: GfxDevice): void {
        device.destroyTexture(this.gfxTexture);
    }
}

export class TextureCache {
    public inner: Map<string, Texture> = new Map();

    public get(key: string): Texture | undefined {
        return this.inner.get(key.toLowerCase())
    }

    public async preload(name: string, context: SceneContext) {
        name = name.toLowerCase();
        if (name == "" || this.inner.get(name) != undefined) return;

        const texture_file = encodeURIComponent(name.replace(".tga", "") + ".btf");
        const raw = await context.dataFetcher.fetchData(`${pathBase}/${texture_file.toLowerCase()}`, {allow404: true});
        if (raw.byteLength == 0) return;
        this.inner.set(name, new Texture(name, context.device, raw));
    }

    public destroy(device: GfxDevice) {
        for (const tex of this.inner.values()) {
            tex.destroy(device);
        }
        this.inner.clear();
    }
}
