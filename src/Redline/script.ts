import ArrayBufferSlice from "../ArrayBufferSlice";
import { rust } from "../rustlib";
import { SceneContext } from "../SceneBase";
import { pathBase } from "./scenes";

export async function loadPcScript(context: SceneContext): Promise<rust.RedlineScript> {
    const raw = await context.dataFetcher.fetchData(`${pathBase}/pc_script.thg`);
    const scripts = rust.RedlineScript.load(raw.createTypedArray(Uint8Array));
    return scripts;
}
