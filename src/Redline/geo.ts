
import { rust } from "../rustlib.js";
import { GfxDevice, GfxBuffer, GfxFormat, GfxBufferUsage, GfxBufferFrequencyHint } from "../gfx/platform/GfxPlatform";
import ArrayBufferSlice from "../ArrayBufferSlice";
import { createBufferFromData } from "../gfx/helpers/BufferHelpers.js";
import { SceneContext } from "../SceneBase";
import { pathBase } from "./Scenes";
import { TextureCache } from "./material";

export type Mesh = {
    texture: string,
    name: string,
    color: number,
    vertexOffset: number,
    vertexCount: number,
    indexOffset: number,
    indexCount: number,
    renderFlags: number,
}

export class Geo {
    public indexBuffer: GfxBuffer;
    public vertexBuffer: GfxBuffer;

    public meshes: Mesh[] = [];

    constructor(name: string, device: GfxDevice, raw: ArrayBufferSlice) {
        const model = rust.RedlineGeo.load(raw.createTypedArray(Uint8Array));

        this.indexBuffer = createBufferFromData(
            device,
            GfxBufferUsage.Index,
            GfxBufferFrequencyHint.Static,
            model.index_buffer()
        );
        device.setResourceName(this.indexBuffer, `${name} (INDEX)`);
        this.vertexBuffer = createBufferFromData(
            device,
            GfxBufferUsage.Vertex,
            GfxBufferFrequencyHint.Static,
            model.vertex_buffer()
        );
        device.setResourceName(this.vertexBuffer, `${name} (VERTEX)`);

        const rawMeshes = model.meshes();
        for (const m of rawMeshes) {
            this.meshes.push(
                {
                    texture: m.texture,
                    name: m.name,
                    color: m.color,
                    vertexOffset: m.vertex_offset,
                    vertexCount: m.vertex_count,
                    indexOffset: m.index_offset,
                    indexCount: m.index_count,
                    renderFlags: m.render_flags,
                }
            );

            m.free();
        }

        model.free();
    }

    public destroy(device: GfxDevice): void {
        device.destroyBuffer(this.indexBuffer);
        device.destroyBuffer(this.vertexBuffer);
    }
}


export class GeoCache {
    public inner: Map<string, Geo> = new Map();

    public get(key: string): Geo | undefined {
        return this.inner.get(key.toLowerCase())
    }

    public async preload(name: string, context: SceneContext, textures: TextureCache): Promise<boolean> {
        name = name.toLowerCase();
        if (name == "" || this.inner.get(name) != undefined) return false;

        const geo_file = encodeURIComponent(name + ".geo");
        const raw = await context.dataFetcher.fetchData(`${pathBase}/${geo_file}`, {allow404: true});
        if (raw.byteLength == 0) return false;
        const geo = new Geo(name, context.device, raw);
        this.inner.set(name, geo);

        for (const mesh of geo.meshes) {
            await textures.preload(mesh.texture, context);
        }
        return true;
    }

    public destroy(device: GfxDevice) {
        for (const geo of this.inner.values()) {
            geo.destroy(device);
        }
        this.inner.clear();
    }
}
