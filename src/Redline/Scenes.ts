
import { rust } from "../rustlib.js";
import { GfxDevice } from "../gfx/platform/GfxPlatform";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase";
import { FakeTextureHolder } from "../TextureHolder";
import { SceneGfx, ViewerRenderInput } from "../viewer";
import * as UI from "../ui";

import { Texture } from "./material";

const pathBase = `Redline`;

class RedlineRenderer implements SceneGfx {
    public textureHolder = new FakeTextureHolder([]);

    constructor(private sceneContext: SceneContext, private textures: Texture[]) {
        for (const tex of this.textures) {
            this.textureHolder.viewerTextures.push(tex);
        }
        this.textureHolder.onnewtextures();
    }

    public render(device: GfxDevice, viewerInput: ViewerRenderInput): void {}

    public destroy(device: GfxDevice): void {}
}

class RedlineSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string) {
    }

    public async createScene(device: GfxDevice, context: SceneContext): Promise<SceneGfx> {
        const worldRaw = await context.dataFetcher.fetchData(`${pathBase}/${this.id}`);
        const world = rust.RedlineWorld.load(worldRaw.createTypedArray(Uint8Array));
        const textures = [];
        console.log(world.list_textures());
        for (const texture of world.list_textures()) {
            if (texture == "") continue;
            const texture_file = texture.replace(".tga", "") + ".btf";
            const raw = await context.dataFetcher.fetchData(`${pathBase}/${texture_file}`);
            textures.push(new Texture(texture, device, raw));
        }
        console.log(world.list_assets());

        return new RedlineRenderer(context, textures);
    }
}

export const sceneGroup: SceneGroup = {
    id: "Redline",
    name: "Redline",

    sceneDescs: [
        "Tutorial",
        new RedlineSceneDesc("footTraining.wld", "Foot Training"),
        new RedlineSceneDesc("carTraining.wld", "Vehicle Training"),
        "Campaign",
        new RedlineSceneDesc("StadiumCity.wld", "Stadium City"),
        new RedlineSceneDesc("Yahoos,wld", "Yahoos"),
        new RedlineSceneDesc("toxicorp.wld", "ToxiCorp"),
        new RedlineSceneDesc("RED6.wld", "Red 6"),
        new RedlineSceneDesc("AIRPORT.wld", "Airport"),
        new RedlineSceneDesc("Freakway.wld", "Freakway"),
        new RedlineSceneDesc("HubChallenge.wld", "Challenge"),
        new RedlineSceneDesc("Sanctum.wld", "Sanctum"),
        new RedlineSceneDesc("Boom.wld", "Boom"),
        new RedlineSceneDesc("Area51.wld", "Area 51"),
        new RedlineSceneDesc("Barrage.wld", "Barrage"),
        new RedlineSceneDesc("Showdown.wld", "Showdown"),
        "Secret",
        new RedlineSceneDesc("BeyondGames.wld", "BeyondGames"),
    ],
};
