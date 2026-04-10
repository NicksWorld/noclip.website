
import { GfxDevice } from "../gfx/platform/GfxPlatform";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase";
import { FakeTextureHolder } from "../TextureHolder";
import { SceneGfx, ViewerRenderInput } from "../viewer";
import * as UI from "../ui";

const pathBase = `Redline`;

class Scene implements SceneGfx {
    public textureHolder = new FakeTextureHolder([]);

    constructor(private sceneContext: SceneContext) {}

    public render(device: GfxDevice, viewerInput: ViewerRenderInput): void {}

    public destroy(device: GfxDevice): void {}
}

class RedlineSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string) {
        // Load world from file id
    }

    public async createScene(device: GfxDevice, sceneContext: SceneContext): Promise<SceneGfx> {
        return new Scene(sceneContext);
    }
}

export const sceneGroup: SceneGroup = {
    id: "Redline",
    name: "Redline",

    sceneDescs: [
        new RedlineSceneDesc("Freakway.wld", "Freakway"),
    ],
};
