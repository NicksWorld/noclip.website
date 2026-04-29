
import { mat4, vec3 } from "gl-matrix";
import { rust } from "../rustlib.js";
import { AssetManager, WorldAsset } from "./assets.js";
import { RedlineRenderer, RedlineRenderInstList } from "./scenes.js";
import { ViewerRenderInput } from "../viewer.js";
import { Geo } from "./geo.js";
import { Anim } from "./anim.js";
import { SceneContext } from "../SceneBase.js";

export interface RedlineEntity {
    shouldCull: boolean;
    render(renderer: RedlineRenderer, inst: RedlineRenderInstList, viewerInput: ViewerRenderInput): void;
}

export async function load_entity(entity: rust.Redline.Entity, assets: AssetManager, context: SceneContext): Promise<RedlineEntity | undefined> {
    if ("Model" in entity) {
        return new RedlineModel(entity.Model, assets);
    }
    if ("Anim" in entity) {
        return new RedlineModel(entity.Anim, assets);
    }
    if ("Item" in entity) {
        const item = new RedlineItem(entity.Item, assets);
        await item.load(assets, context);
        return item;
    }
    return;
}

function correct_pos(pos: [number, number, number]): [number, number, number] {
    return [-pos[0], pos[1], pos[2]];
}

class RedlineModel implements RedlineEntity {
    private mat: mat4;
    private asset_idx: number;
    private asset: WorldAsset;

    public shouldCull = true;

    constructor(entity: rust.Redline.EntityModel | rust.Redline.EntityAnim, assets: AssetManager) {
        this.asset_idx = entity.asset_idx;
        this.asset = assets.asset_table[this.asset_idx];

        this.mat = mat4.create();
        mat4.identity(this.mat);

        const forward = vec3.negate(vec3.create(), entity.forward)
        const rot = mat4.lookAt(mat4.create(), vec3.create(), forward, entity.up);

        mat4.translate(this.mat, this.mat, correct_pos(entity.pos));
        mat4.multiply(this.mat, this.mat, rot);
    }

    public render(renderer: RedlineRenderer, inst: RedlineRenderInstList, viewerInput: ViewerRenderInput): void {
        if (this.asset instanceof Geo) {
            renderer.renderModel(inst, this.asset, this.mat);
        } else if (this.asset instanceof Anim) {
            renderer.renderAnim(inst, this.asset, this.mat, false, 1, viewerInput.time);
        } else if (this.asset != undefined) {
            if (this.asset.static) {
                renderer.renderModel(inst, this.asset.static, this.mat, this.asset.transparent);
            }
            if (this.asset.anim) {
                renderer.renderAnim(inst, this.asset.anim, this.mat, this.asset.transparent, this.asset.anim_dir, viewerInput.time);
            }
        }
    }
}

class RedlineItem implements RedlineEntity {
    private mat: mat4;
    private item: rust.Redline.ScriptItem;
    private mdl: Geo | undefined;

    public shouldCull = false;

    constructor(entity: rust.Redline.EntityItem, assets: AssetManager) {
        this.mat = mat4.create();
        mat4.identity(this.mat);
        mat4.translate(this.mat, this.mat, correct_pos(entity.pos));


        const item = assets.scripts.lookup_item(entity.name.toLowerCase());
        if (!item) {
            throw new Error("Encountered unknown item: " + entity.name);
        }

        this.item = item;
    }

    public async load(assets: AssetManager, context: SceneContext) {
        this.mdl = (await assets.load_geo(this.item.geo, context));
    }

    public render(renderer: RedlineRenderer, inst: RedlineRenderInstList, viewerInput: ViewerRenderInput): void {
        if (!this.mdl) return;
        const mat = mat4.create();
        mat4.identity(mat);
        if (this.item.rotation_speed != 0) {
            const rot = Math.PI * (this.item.rotation_speed * (viewerInput.time / 100));
            mat4.rotateY(mat, mat, rot);
        }

        mat4.multiply(mat, this.mat, mat);

        renderer.renderModel(inst, this.mdl, mat);
    }
}
