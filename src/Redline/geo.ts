
import { rust } from "../rustlib.js";
import { GfxDevice, GfxBuffer, GfxBufferUsage, GfxBufferFrequencyHint } from "../gfx/platform/GfxPlatform";
import ArrayBufferSlice from "../ArrayBufferSlice";
import { createBufferFromData } from "../gfx/helpers/BufferHelpers.js";

export class Geo {
    public indexBuffer: GfxBuffer;
    public vertexBuffer: GfxBuffer;

    public hasBakedLighting: boolean;

    public meshes: rust.Redline.Mesh[] = [];

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

        this.meshes = model.meshes();

        if (name.includes("trainer_cdbarrier")) {
            console.log(model);
            console.log(this.meshes);
        }

        model.free();
    }

    public destroy(device: GfxDevice): void {
        device.destroyBuffer(this.indexBuffer);
        device.destroyBuffer(this.vertexBuffer);
    }
}


