
import { rust } from "../rustlib.js";
import { GfxAttachmentState, GfxBlendFactor, GfxBlendMode, GfxChannelWriteMask, GfxCullMode, GfxDevice, GfxFormat, GfxInputLayout, GfxMipFilterMode, GfxProgram, GfxSampler, GfxTexFilterMode, GfxVertexBufferFrequency, GfxWrapMode } from "../gfx/platform/GfxPlatform";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase";
import { FakeTextureHolder } from "../TextureHolder";
import { SceneGfx, ViewerRenderInput } from "../viewer";

import { GfxRenderHelper } from "../gfx/render/GfxRenderHelper.js";
import { fillMatrix4x3, fillMatrix4x4 } from "../gfx/helpers/UniformBufferHelpers.js";
import { mat4, quat, vec3 } from "gl-matrix";
import { GfxRenderInstList } from "../gfx/render/GfxRenderInstManager.js";
import { makeBackbufferDescSimple, standardFullClearRenderPassDescriptor } from "../gfx/helpers/RenderGraphHelpers.js";
import { GfxrAttachmentSlot } from "../gfx/render/GfxRenderGraph.js";

import { Texture } from "./material";
import { Geo} from "./geo";
import { FullbrightShader, VertexLitShader as VertexLitShader } from "./shaders";
import { loadPcScript } from "./script.js";
import { WorldGeometry } from "./world.js";
import { AssetManager } from "./assets.js";
import { Anim } from "./anim.js";
import { RedlineScriptObject } from "noclip-rust-support";
import { CullMode } from "../gx/gx_enum.js";

export const pathBase = `Redline`;

class RedlineRenderInstList {
    public opaque: GfxRenderInstList = new GfxRenderInstList();
    public transparent: GfxRenderInstList = new GfxRenderInstList();
}

type RedlineObject = {
    static: Geo | undefined,
    anim: Anim | undefined,
    anim_scale: vec3,
    anim_dir: number,
    transparent: boolean,
};

type RedlineAsset = Geo | Anim | RedlineObject | undefined;

export const attachmentStatesAdditive: GfxAttachmentState[] = [{
    alphaBlendState: {blendMode: GfxBlendMode.Add, blendDstFactor: GfxBlendFactor.One, blendSrcFactor: GfxBlendFactor.SrcAlpha},
    channelWriteMask: GfxChannelWriteMask.AllChannels,
    rgbBlendState: {blendMode: GfxBlendMode.Add, blendDstFactor: GfxBlendFactor.OneMinusSrc, blendSrcFactor: GfxBlendFactor.SrcAlpha}
}];
export const attachmentStates: GfxAttachmentState[] = [{
    alphaBlendState: {blendMode: GfxBlendMode.Add, blendDstFactor: GfxBlendFactor.OneMinusDstAlpha, blendSrcFactor: GfxBlendFactor.DstAlpha},
    channelWriteMask: GfxChannelWriteMask.AllChannels,
    rgbBlendState: {blendMode: GfxBlendMode.Add, blendDstFactor: GfxBlendFactor.OneMinusDstAlpha, blendSrcFactor: GfxBlendFactor.DstAlpha}
}];

export class RedlineRenderer implements SceneGfx {
    public textureHolder = new FakeTextureHolder([]);

    private renderHelper: GfxRenderHelper;
    private renderInstList = new RedlineRenderInstList();
    private skyRenderInstList = new RedlineRenderInstList();

    private vertexLitShaderProgram: GfxProgram;
    private fullbrightShaderProgram: GfxProgram;
    private sampler: GfxSampler;

    private inputLayout: GfxInputLayout;

    constructor(
        private sceneContext: SceneContext,
        public assets: AssetManager,
        private asset_table: RedlineAsset[],
        private sky: Geo | undefined,
        private to_render: WorldGeometry[],
    ) {
        this.renderHelper = new GfxRenderHelper(sceneContext.device, sceneContext);
        const cache = this.renderHelper.renderCache;

        this.vertexLitShaderProgram = cache.createProgram(new VertexLitShader());
        this.fullbrightShaderProgram = cache.createProgram(new FullbrightShader());
        this.sampler = cache.createSampler({
            minFilter: GfxTexFilterMode.Bilinear,
            magFilter: GfxTexFilterMode.Bilinear,
            mipFilter: GfxMipFilterMode.Nearest,
            wrapS: GfxWrapMode.Repeat,
            wrapT: GfxWrapMode.Repeat,
        });

        this.inputLayout = cache.createInputLayout({
            vertexAttributeDescriptors: [
                {
                    location: VertexLitShader.a_Position,
                    format: GfxFormat.F32_RGB,
                    bufferByteOffset: 0,
                    bufferIndex: 0,
                },
                {
                    location: VertexLitShader.a_Color,
                    format: GfxFormat.U8_RGBA_NORM,
                    bufferByteOffset: 12,
                    bufferIndex: 0,
                },
                {
                    location: VertexLitShader.a_Uv,
                    format: GfxFormat.F32_RG,
                    bufferByteOffset: 12 + 4,
                    bufferIndex: 0,
                },
                {
                    location: VertexLitShader.a_Normal,
                    format: GfxFormat.F32_RGB,
                    bufferByteOffset: 12 + 4 + 8,
                    bufferIndex: 0,
                },
            ],

            vertexBufferDescriptors: [
                {
                    byteStride: 9 * 4,
                    frequency: GfxVertexBufferFrequency.PerVertex,
                },
            ],

            indexBufferFormat: GfxFormat.U16_R,
        })

        for (const tex of this.assets.textures.values()) {
            this.textureHolder.viewerTextures.push(tex);
        }
        this.textureHolder.onnewtextures();
    }


    private renderAnim(inst: RedlineRenderInstList, anim: Anim, pos: mat4, transparent: boolean, dir: number, time: number): void {
        if (anim.sequential) {
            const framerate = 15;
            const frame = Math.round(time / (1000 / framerate /*anim.sequential.framerate*/)) % anim.sequential.frames.length;
            const model = this.assets.get_geo(anim.sequential.frames[frame]);
            if (model != undefined) {
                this.renderModel(inst, model, pos, transparent);
            }
        } else {
            // TODO
        }
    }

    private renderModel(inst: RedlineRenderInstList, model: Geo, pos: mat4, transparent: boolean = false): void {
        for (const mesh of model.meshes) {
            if (mesh.texture == "") continue;
            const tex = this.assets.get_texture(mesh.texture);
            if (tex == undefined) continue; // TODO (vertex colored)
            const renderInst = this.renderHelper.renderInstManager.newRenderInst();

            let inst_list = inst.opaque;

            // Determine correct shader setup
            if ((mesh.renderFlags & 0x01) != 0 || transparent) {
                renderInst.setMegaStateFlags({
                    depthWrite: false,
                    attachmentsState: attachmentStatesAdditive,
                });
                inst_list = inst.transparent;
            }
            if (tex.gfxTexture.pixelFormat == GfxFormat.U8_RGBA_NORM) {
                tex.gfxTexture.pixelFormat
                renderInst.setMegaStateFlags({
                    cullMode: GfxCullMode.Front,
                    depthWrite: true,
                    attachmentsState: attachmentStates,
                });
            }
            // renderFlags2 0x10000 appears to be the flag for vertex color baked lighting
            if (mesh.renderFlags & 0x4 || ((mesh.renderFlags2 & 0x10000) == 0)) {
                renderInst.setGfxProgram(this.fullbrightShaderProgram);
            } else {
                renderInst.setGfxProgram(this.vertexLitShaderProgram);
            }

            const position = renderInst.allocateUniformBufferF32(VertexLitShader.ub_Position, 12);
            fillMatrix4x3(position, 0, pos);

            renderInst.setSamplerBindings(0, [
                {
                    gfxTexture: tex.gfxTexture,
                    gfxSampler: this.sampler,
                }
            ]);

            renderInst.setVertexInput(
                this.inputLayout,
                [{ buffer: model.vertexBuffer, byteOffset: mesh.vertexOffset * 9 * 4 }],
                { buffer: model.indexBuffer, byteOffset: mesh.indexOffset * 2 },
            );

            renderInst.setDrawCount(mesh.indexCount * 3);
            inst_list.submitRenderInst(renderInst);
        }
    }

    public render(device: GfxDevice, viewerInput: ViewerRenderInput): void {
        this.renderHelper.debugDraw.beginFrame(
            viewerInput.camera.projectionMatrix,
            viewerInput.camera.viewMatrix,
            viewerInput.backbufferWidth,
            viewerInput.backbufferHeight
        );

        const template = this.renderHelper.pushTemplateRenderInst();
        template.setBindingLayouts([
            { numSamplers: 1, numUniformBuffers: 2 },
        ]);

        const data = template.allocateUniformBufferF32(VertexLitShader.ub_SceneParams, 16);
        let offs = 0;
        offs += fillMatrix4x4(data, offs, viewerInput.camera.clipFromWorldMatrix);

        for (const entity of this.to_render) {
            const mdl = this.asset_table[entity.asset_index]!;
            if (mdl == undefined) {
                // Script object or Animated
                continue;
            }
            const model = mdl!;

            if (model instanceof Geo) {
                this.renderModel(this.renderInstList, model, entity.mat);
            } else if (model instanceof Anim) {
                this.renderAnim(this.renderInstList, model, entity.mat, false, 1, viewerInput.time);
            } else if (model != null) {
                if (model.anim != null) {
                    const translate = vec3.create();
                    const rotation = quat.create();
                    const scale = vec3.create();
                    mat4.getTranslation(translate, entity.mat);
                    mat4.getRotation(rotation, entity.mat);
                    mat4.getScaling(scale, entity.mat);

                    vec3.multiply(scale, scale, model.anim_scale);
                    const mat = mat4.create();
                    mat4.fromRotationTranslationScale(mat, rotation, translate, scale);

                    this.renderAnim(this.renderInstList, model.anim, mat, model.transparent, model.anim_dir, viewerInput.time);
                }
                if (model.static != null) {
                    this.renderModel(this.renderInstList, model.static, entity.mat, model.transparent);
                }
            }
        }

        if (this.sky) {
            const translation = vec3.create();
            mat4.getTranslation(translation, viewerInput.camera.worldMatrix);
            const mat = mat4.create();
            mat4.identity(mat);
            mat4.translate(mat, mat, translation);
            mat4.scale(mat, mat, [100, 100, 100]);
            this.renderModel(this.skyRenderInstList, this.sky, mat);
        }

        const builder = this.renderHelper.renderGraph.newGraphBuilder();
        const mainColorDesc = makeBackbufferDescSimple(GfxrAttachmentSlot.Color0, viewerInput, standardFullClearRenderPassDescriptor);
        const mainDepthDesc = makeBackbufferDescSimple(GfxrAttachmentSlot.DepthStencil, viewerInput, standardFullClearRenderPassDescriptor);
        const skyDepthDesc = makeBackbufferDescSimple(GfxrAttachmentSlot.DepthStencil, viewerInput, standardFullClearRenderPassDescriptor);

        const mainColorTargetID = builder.createRenderTargetID(mainColorDesc, 'Main Color');
        const mainDepthTargetID = builder.createRenderTargetID(mainDepthDesc, 'Main Depth');
        const skyDepthTargetID = builder.createRenderTargetID(skyDepthDesc, 'Sky Depth');

        builder.pushPass((pass) => {
            pass.setDebugName("Sky");

            pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mainColorTargetID);
            pass.attachRenderTargetID(GfxrAttachmentSlot.DepthStencil, skyDepthTargetID);

            pass.exec((passRenderer, _scope) => {
                this.skyRenderInstList.opaque.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
                this.skyRenderInstList.transparent.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
            });
        });

        builder.pushPass((pass) => {
            pass.setDebugName("Opaque Objects");

            pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mainColorTargetID);
            pass.attachRenderTargetID(GfxrAttachmentSlot.DepthStencil, mainDepthTargetID);

            pass.exec((passRenderer, _scope) => {
                this.renderInstList.opaque.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
            });
        });

        builder.pushPass((pass) => {
            pass.setDebugName("Transparent Objects");

            pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mainColorTargetID);
            pass.attachRenderTargetID(GfxrAttachmentSlot.DepthStencil, mainDepthTargetID);

            pass.exec((passRenderer, _scope) => {
                this.renderInstList.transparent.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
            });
        });

        this.renderHelper.renderInstManager.popTemplate();
        this.renderHelper.debugDraw.pushPasses(builder, mainColorTargetID, mainDepthTargetID);
        this.renderHelper.antialiasingSupport.pushPasses(builder, viewerInput, mainColorTargetID);

        builder.resolveRenderTargetToExternalTexture(mainColorTargetID, viewerInput.onscreenTexture);
        this.renderHelper.prepareToRender();

        builder.execute();
        this.renderInstList.opaque.reset();
        this.renderInstList.transparent.reset();
    }

    public destroy(device: GfxDevice): void {
        this.assets.destroy(device);
    }
}

class RedlineSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string) {
    }

    public async createScene(device: GfxDevice, context: SceneContext): Promise<SceneGfx> {
        const assets = new AssetManager();
        await assets.load(this.id, context);

        // Load base assets
        const asset_list = assets.world.list_assets();
        const asset_table: RedlineAsset[] = [];
        for (const asset of asset_list) {
            console.log(asset_table.length + " " + asset.name);
            let name = asset.name.toLowerCase();
            switch (asset.kind) {
                case 0:
                    const model = await assets.load_geo(name, context);
                    asset_table.push(model);
                    break;
                case 1:
                    const anim = await assets.load_anm(name, context);
                    asset_table.push(anim);
                    break;
                case 2:
                    const scriptObj = assets.scripts.lookup_object(name);
                    if (!scriptObj) {
                        asset_table.push(undefined);
                        break;
                    }
                    let obj: RedlineObject = {static: undefined, anim: undefined, anim_scale: [1, 1, 1], anim_dir: 1, transparent: scriptObj.transparent != 0};
                    if (scriptObj.anim.name == "") {
                        obj.static = await assets.load_geo(scriptObj.geo, context);
                    }
                    asset_table.push(obj);
                    const anim_name = scriptObj.unk6.name;
                    if (anim_name != "") {
                        const anim_desc = assets.scripts.lookup_animdesc(anim_name.toLowerCase());
                        if (anim_desc != undefined) {
                            obj.anim = await assets.load_anm(anim_desc.anim, context);
                            obj.anim_dir = anim_desc.dir;
                            if (anim_desc.scale_x != 0) // 0, 0, 0 seems to be used as a default
                                obj.anim_scale = vec3.fromValues(anim_desc.scale_x, anim_desc.scale_y, anim_desc.scale_z);
                            anim_desc.free();
                        }
                    }

                    if (scriptObj.unk8.name != "") {
                        const s = assets.scripts.lookup_script_array(scriptObj.unk8.name.toLowerCase());
                        if (s && s.scripts[0]) {
                            const x = assets.scripts.lookup_emitter(s.scripts[0]!.name.toLowerCase());
                            console.log(x);
                            if (x && x.unk1_scripts[0]) {
                                const y = assets.scripts.lookup_subemitter(x.unk1_scripts[0].name.toLowerCase());
                            }

                        }
                        if (s) s.free();
                    }

                    scriptObj.free();
                    break;
                default:
                    asset_table.push(undefined);
                    console.log("Unhandled asset type: " + asset.kind);
                    break;
            }

            asset.free();
        }

        const sky_name = assets.world.skybox();
        let sky = undefined
        const ssky = assets.scripts.lookup_sky(sky_name.toLowerCase());
        if (ssky != undefined) {
            sky = ssky.sky;
            ssky.free();
            sky = await assets.load_geo(sky, context);
        }

        const world_geo = assets.world.list_models();
        const to_render = [];
        for (const geo of world_geo) {
            to_render.push(new WorldGeometry(geo));
            geo.free();
        }
        const world_anm = assets.world.list_anims();
        for (const anm of world_anm) {
            to_render.push(new WorldGeometry(anm));
            anm.free();
        }

        return new RedlineRenderer(context, assets, asset_table, sky, to_render);
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
        new RedlineSceneDesc("Stadium_City.wld", "Stadium City"),
        new RedlineSceneDesc("Yahoos.wld", "Yahoos"),
        new RedlineSceneDesc("toxicorp.wld", "ToxiCorp"),
        new RedlineSceneDesc("RED6.wld", "Red 6"),
        new RedlineSceneDesc("AIRPORT.wld", "Airport"),
        new RedlineSceneDesc("terminal.wld", "Airport Terminal"),
        new RedlineSceneDesc("Freakway.wld", "Freakway"),
        new RedlineSceneDesc("HubChallenge.wld", "Challenge"),
        new RedlineSceneDesc("Sanctum.wld", "Sanctum"),
        new RedlineSceneDesc("SanctumTower.wld", "Sanctum Tower"),
        new RedlineSceneDesc("Boom.wld", "Boom"),
        new RedlineSceneDesc("Area51.wld", "Area 51"),
        new RedlineSceneDesc("Barrage.wld", "Barrage"),
        new RedlineSceneDesc("Showdown.wld", "Showdown"),
        new RedlineSceneDesc("ShowdownRant.wld", "Showdown Rant"),
        "Hub",
        // These are used for the pre-mission cinematics.
        // TODO: Determine if these are better inter-mixed with campaign missions
        new RedlineSceneDesc("hub0.wld", "Hub0"),
        new RedlineSceneDesc("hub1.wld", "Hub1"),
        new RedlineSceneDesc("hub2.wld", "Hub2"),
        new RedlineSceneDesc("hub3.wld", "Hub3"),
        new RedlineSceneDesc("hub4.wld", "Hub4"),
        new RedlineSceneDesc("hubchallenge.wld", "HubChallenge"),
        new RedlineSceneDesc("areahub0.wld", "AreaHub0"),
        new RedlineSceneDesc("areahub2.wld", "AreaHub2"),
        new RedlineSceneDesc("areahub3.wld", "AreaHub3"),
        new RedlineSceneDesc("areahub_final.wld", "AreaHub Final"),
        "Secret",
        new RedlineSceneDesc("BeyondGames.wld", "BeyondGames"),
        "Unused",
        new RedlineSceneDesc("stadiumfirstlev.wld", "Stadium City (alt)"),
        "Multiplayer",
        new RedlineSceneDesc("acidland.wld", "Acidland"),
        new RedlineSceneDesc("asphixia ctf.wld", "Asphixia CTF"),
        new RedlineSceneDesc("bloodbucket.wld", "Blood Bucket"),
        new RedlineSceneDesc("crimson nile ctf.wld", "Crimson Nile CTF"),
        new RedlineSceneDesc("deathdome.wld", "Deathdome"),
        new RedlineSceneDesc("denizone.wld", "Denizone"),
        new RedlineSceneDesc("killcage.wld", "Killcage"),
        new RedlineSceneDesc("octotron.wld", "Octotron"),
        new RedlineSceneDesc("outpost.wld", "Outpost"),
        new RedlineSceneDesc("ranthive.wld", "Rant Hive"),
        new RedlineSceneDesc("slaughterhouse ctf.wld", "Slaughterhouse CTF"),
        new RedlineSceneDesc("triagonizer.wld", "Triagonizer"),
    ],
};
