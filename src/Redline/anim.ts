import ArrayBufferSlice from "../ArrayBufferSlice";
import { GfxDevice } from "../gfx/platform/GfxPlatform";
import { rust } from "../rustlib";

export class Anim {
    public sequential: rust.Redline.SeqAnim | undefined;

    constructor(name: string, device: GfxDevice, raw: ArrayBufferSlice) {
        const anim = rust.redline_load_seq_anim(raw.createTypedArray(Uint8Array));
        if (anim != undefined) {
            this.sequential = anim;
            return;
        }
    }
}
