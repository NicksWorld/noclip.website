import { Texture } from "./material";
import { Geo } from "./geo";
import { SceneContext } from "../SceneBase";
import { GfxDevice } from "../gfx/platform/GfxPlatform";
import ArrayBufferSlice from "../ArrayBufferSlice";
import { rust } from "../rustlib";
import { Anim } from "./anim";

export class AssetManager {
    public textures: Map<string, Texture> = new Map();
    public animations: Map<string, Anim> = new Map();
    public geometry: Map<string, Geo> = new Map();

    public world: rust.RedlineWorld;
    public scripts: rust.RedlineScript;

    constructor(public pathBase: string) {};

    private formatFilename(name: string, ext: string, replace_ext: string = "") {
        name = name.toLowerCase();
        ext = ext.toLowerCase();
        replace_ext = replace_ext.toLowerCase();

        if (replace_ext.length > 0 && name.endsWith(replace_ext)) {
            name = name.slice(0, name.length - replace_ext.length - 1);
        }
        if (!name.endsWith("." + ext)) {
            name += "." + ext;
        }
        return encodeURIComponent(name);
    }

    private async fetch(context: SceneContext, filename: string): Promise<ArrayBufferSlice | undefined> {
        const raw = await context.dataFetcher.fetchData(`${this.pathBase}/${filename}`, {allow404: true});
        if (raw.byteLength == 0) return;
        return raw;
    }

    public get_anim(name: string): Anim | undefined {
        return this.animations.get(this.formatFilename(name, "anm"));
    }
    public get_texture(name: string): Texture | undefined {
        return this.textures.get(this.formatFilename(name, "btf", "tga"));
    }
    public get_geo(name: string): Geo | undefined {
        return this.geometry.get(this.formatFilename(name, "geo"));
    }

    // Entrypoint to the majority of asset loading
    public async load(world: string, context: SceneContext) {
        let main_script = "pc_script";
        if (this.pathBase == "Redline/ArenaDemo") main_script = "arenascript";
        // Preload required scripts
        this.scripts = (await this.load_script(main_script, context))!;
        this.world = (await this.load_world(world, context))!;
    }

    public async load_world(name: string, context: SceneContext): Promise<rust.RedlineWorld | undefined> {
        let raw = await this.fetch(context, this.formatFilename(name, "wld"));
        if (raw == undefined) return;
        const world = rust.RedlineWorld.load(raw!.createTypedArray(Uint8Array));

        for (const tex of world.list_textures()) {
            await this.load_texture(tex, context);
        }

        return world;
    }

    public async load_script(name: string, context: SceneContext): Promise<rust.RedlineScript | undefined> {
        let raw = (await this.fetch(context, this.formatFilename(name, "thg")))!;
        const scripts = rust.RedlineScript.load(raw.createTypedArray(Uint8Array));

        return scripts;
    }

    public async load_anm(name: string, context: SceneContext): Promise<Anim | undefined> {
        let raw = (await this.fetch(context, this.formatFilename(name, "anm")))!;

        const anim = new Anim(name, context.device, raw);

        if (anim.sequential) {
            for (const frame of anim.sequential.frames) {
                // Preload constituent frames
                this.load_geo(frame, context);
            }
        }

        this.animations.set(name, anim);
        return anim;
    }

    public async load_texture(name: string, context: SceneContext): Promise<Texture | undefined> {
        if (name == "")  return;
        name = this.formatFilename(name, "btf", "tga");
        let texture = this.textures.get(name);
        if (texture != undefined) return texture;
        
        const raw = await this.fetch(context, name);
        if (raw == undefined) return;
        
        texture = new Texture(name, context.device, raw);
        this.textures.set(name, texture);
        return texture;
    }

    public async load_geo(name: string, context: SceneContext): Promise<Geo | undefined> {
        if (name == "") return;
        name = this.formatFilename(name, "geo");
        let geo = this.geometry.get(name);
        if (geo != undefined) return geo;
        
        const raw = await this.fetch(context, name);
        if (raw == undefined) return;
        
        geo = new Geo(name, context.device, raw);
        this.geometry.set(name, geo);

        // Preload textures
        // TODO: Determine if this is really needed; they may be in the world data
        for (const mesh of geo.meshes) {
            this.load_texture(mesh.texture, context);
        }

        return geo;
    }

    public destroy(device: GfxDevice) {
        for (const geo of this.geometry.values()) {
            geo.destroy(device);
        }
        this.geometry.clear();
        for (const texture of this.textures.values()) {
            texture.destroy(device);
        }
        this.textures.clear();

        if (this.scripts) this.scripts.free();
        if (this.world) this.world.free();
    }
}
