
import { rust } from "../rustlib.js";
import { GfxDevice, GfxBuffer, GfxBufferUsage, GfxBufferFrequencyHint } from "../gfx/platform/GfxPlatform";
import ArrayBufferSlice from "../ArrayBufferSlice";
import { createBufferFromData } from "../gfx/helpers/BufferHelpers.js";

export type Mesh = {
    texture: string,
    name: string,
    color: number,
    vertexOffset: number,
    vertexCount: number,
    indexOffset: number,
    indexCount: number,
    renderFlags: number,
    renderFlags2: number,
}

export class Geo {
    public indexBuffer: GfxBuffer;
    public vertexBuffer: GfxBuffer;

    public hasBakedLighting: boolean;

    public meshes: Mesh[] = [];

    constructor(public name: string, device: GfxDevice, raw: ArrayBufferSlice) {
        const model = rust.RedlineGeo.load(raw.createTypedArray(Uint8Array));

        // Models with filenames beginning with ! use vertex color as lighting
        // Other models appear to fill it with garbage data
        this.hasBakedLighting = name.startsWith("!");

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
                    renderFlags2: m.unk4, // TODO: Verify
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


