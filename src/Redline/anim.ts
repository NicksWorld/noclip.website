import ArrayBufferSlice from "../ArrayBufferSlice";
import { GfxDevice } from "../gfx/platform/GfxPlatform";
import { rust } from "../rustlib";

export type SequentialAnim = {
    framerate: number,
    frames: string[],
}

export class Anim {
    public sequential: SequentialAnim | undefined;

    constructor(name: string, device: GfxDevice, raw: ArrayBufferSlice) {
        const anim = rust.RedlineSeqAnim.load(raw.createTypedArray(Uint8Array));
        if (anim != undefined) {
            this.sequential = {
                framerate: anim.framerate,
                frames: anim.frames,
            };
            anim.free();
            return;
        }
    }
}
