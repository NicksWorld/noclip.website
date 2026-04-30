
import { GfxAttachmentState, GfxBlendFactor, GfxBlendMode, GfxChannelWriteMask, GfxCullMode, GfxDevice, GfxFormat, GfxInputLayout, GfxMipFilterMode, GfxProgram, GfxSampler, GfxTexFilterMode, GfxVertexBufferFrequency, GfxWrapMode } from "../gfx/platform/GfxPlatform";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase";
import { FakeTextureHolder } from "../TextureHolder";
import { SceneGfx, ViewerRenderInput } from "../viewer";

import { GfxRenderHelper } from "../gfx/render/GfxRenderHelper.js";
import { fillMatrix4x3, fillMatrix4x4 } from "../gfx/helpers/UniformBufferHelpers.js";
import { mat4, vec3 } from "gl-matrix";
import { GfxRenderInstList } from "../gfx/render/GfxRenderInstManager.js";
import { makeBackbufferDescSimple, standardFullClearRenderPassDescriptor } from "../gfx/helpers/RenderGraphHelpers.js";
import { GfxrAttachmentSlot } from "../gfx/render/GfxRenderGraph.js";

import { Geo} from "./geo";
import { ChromeShader, FullbrightShader, VertexLitShader as VertexLitShader } from "./shaders";
import { AssetManager } from "./assets.js";
import { Anim } from "./anim.js";
import { CameraController } from "../Camera.js";
import { load_entity, RedlineEntity } from "./entity.js";
import * as UI from "../ui";
import { rust } from "../rustlib";

export const pathBase = `Redline`;

export class RedlineRenderInstList {
    public opaque: GfxRenderInstList = new GfxRenderInstList();
    public transparent: GfxRenderInstList = new GfxRenderInstList();
}

export type RedlineObject = {
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

    public renderHelper: GfxRenderHelper;
    private renderInstList = new RedlineRenderInstList();
    private skyRenderInstList = new RedlineRenderInstList();

    private vertexLitShaderProgram: GfxProgram;
    private fullbrightShaderProgram: GfxProgram;
    private chromeShaderProgram: GfxProgram;
    private sampler: GfxSampler;

    private inputLayout: GfxInputLayout;
    // private billboardInputLayout: GfxInputLayout;

    private visibilityLayers: boolean[] = [];
    private showHidden: boolean = false;
    public showQuads: boolean = false;

    constructor(
        private sceneContext: SceneContext,
        public assets: AssetManager,
        private sky: Geo | undefined,
        private entities: (RedlineEntity | undefined)[],
        private visibility: rust.Redline.Visibility[],
    ) {
        this.renderHelper = new GfxRenderHelper(sceneContext.device, sceneContext);
        const cache = this.renderHelper.renderCache;

        this.vertexLitShaderProgram = cache.createProgram(new VertexLitShader());
        this.chromeShaderProgram = cache.createProgram(new ChromeShader());
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
        });

        // this.billboardInputLayout = cache.createInputLayout({
        //     vertexAttributeDescriptors: [
        //         {
        //             location: VertexLitShader.a_Position,
        //             format: GfxFormat.F32_RG,
        //             bufferByteOffset: 0,
        //             bufferIndex: 0,
        //         },
        //         {
        //             location: VertexLitShader.a_Uv,
        //             format: GfxFormat.F32_RG,
        //             bufferByteOffset: 8,
        //             bufferIndex: 0,
        //         },
        //     ],
        //
        //     vertexBufferDescriptors: [
        //         {
        //             byteStride: 16,
        //             frequency: GfxVertexBufferFrequency.PerVertex,
        //         },
        //     ],
        //
        //     indexBufferFormat: GfxFormat.U16_R,
        // });

        for (const tex of this.assets.textures.values()) {
            this.textureHolder.viewerTextures.push(tex);
        }
        this.textureHolder.onnewtextures();
    }

    public createPanels(): UI.Panel[] {
        const panels = [];
        panels.push(this.createLayerPanel());
        return panels;
    }

    private createLayerPanel(): UI.Panel {
        const layersPanel = new UI.Panel();
        layersPanel.customHeaderBackgroundColor = UI.COOL_BLUE_COLOR;
        layersPanel.setTitle(UI.LAYER_ICON, "Visibility");

        // Hidden
        const showHidden = new UI.Checkbox("Show Hidden", false);
        showHidden.onchanged = () => {
            this.showHidden = showHidden.checked;
        };
        layersPanel.contents.appendChild(showHidden.elem);

        // Quadrants
        const showQuads = new UI.Checkbox("Show Quadrants", false);
        showQuads.onchanged = () => {
            this.showQuads = showQuads.checked;
        };
        layersPanel.contents.appendChild(showQuads.elem);

        // Visibility Clusters
        let i = 0;
        for (const cluster of this.assets.world.vis_sets().clusters) {
            const checkbox = new UI.Checkbox(cluster.name, true);
            const idx = i;
            checkbox.onchanged = () => {
                this.visibilityLayers[idx] = checkbox.checked;
            };
            layersPanel.contents.appendChild(checkbox.elem);
            i++;
        }
        return layersPanel;
    }

    public renderAnim(inst: RedlineRenderInstList, anim: Anim, pos: mat4, transparent: boolean, dir: number, time: number): void {
        if (anim.sequential) {
            const framerate = anim.sequential.framerate;
            let frame = Math.floor(time * framerate / 1000) % anim.sequential.frames.length;
            if (dir < 0) {
                frame = anim.sequential.frames.length - frame - 1;
            }
            const model = this.assets.get_geo(anim.sequential.frames[frame]);
            if (model != undefined) {
                this.renderModel(inst, model, pos, transparent);
            }
        } else {
            // TODO
        }
    }

    public renderModel(inst: RedlineRenderInstList, model: Geo, pos: mat4, transparent: boolean = false): void {
        for (const mesh of model.meshes) {
            // Appears to be collision meshes and triggers
            // TODO: This culls too much, and should likely be doing PVS lookup
            // if (mesh.texture == "" && mesh.render_flags == 0 && mesh.unk4 == 0) continue;
            let tex = this.assets.get_texture(mesh.texture);
            const renderInst = this.renderHelper.renderInstManager.newRenderInst();
            let inst_list = inst.opaque;

            // Determine correct shader setup
            if ((mesh.render_flags & 0x01) != 0 || transparent) {
                renderInst.setMegaStateFlags({
                    depthWrite: false,
                    attachmentsState: attachmentStatesAdditive,
                });
                inst_list = inst.transparent;
            }
            // if (tex.gfxTexture.pixelFormat == GfxFormat.U8_RGBA_NORM) {
            //     tex.gfxTexture.pixelFormat
            //     renderInst.setMegaStateFlags({
            //         cullMode: GfxCullMode.Front,
            //         depthWrite: true,
            //         attachmentsState: attachmentStates,
            //     });
            // }
            // unk4 0x10000 appears to be the flag for vertex color baked lighting
            if (mesh.render_flags & 0x4) {
                renderInst.setGfxProgram(this.fullbrightShaderProgram);
            } else if (mesh.render_flags & 0x12) {
                renderInst.setGfxProgram(this.vertexLitShaderProgram);
                // TODO: This needs to blend between texture and reflectionmap,
                // based on vertex color alpha
                tex = this.assets.get_texture("reflectionmap")!;
            } else if ((mesh.unk4 & 0x10000) == 0) {
                renderInst.setGfxProgram(this.fullbrightShaderProgram);
            }else {
                renderInst.setGfxProgram(this.vertexLitShaderProgram);
            }

            const position = renderInst.allocateUniformBufferF32(VertexLitShader.ub_Position, 12);
            fillMatrix4x3(position, 0, pos);

            if (!tex) continue;
            renderInst.setSamplerBindings(0, [
                {
                    gfxTexture: tex.gfxTexture,
                    gfxSampler: this.sampler,
                }
            ]);

            renderInst.setVertexInput(
                this.inputLayout,
                [{ buffer: model.vertexBuffer, byteOffset: mesh.vertex_offset * 9 * 4 }],
                { buffer: model.indexBuffer, byteOffset: mesh.index_offset * 2 },
            );

            renderInst.setDrawCount(mesh.index_count * 3);
            inst_list.submitRenderInst(renderInst);
        }
    }

    public adjustCameraController(c: CameraController): void {
        c.setSceneMoveSpeedMult(0.01);
    }

    public render(device: GfxDevice, viewerInput: ViewerRenderInput): void {
        viewerInput.camera.setClipPlanes(0.01);

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
            
        for (let ent_idx = 0; ent_idx < this.entities.length; ent_idx++) {
            const ent = this.entities[ent_idx];
            if (!ent) continue;
            if (!this.showHidden && ent.shouldCull) {
                let show = false;
                for (let i = 0; i < this.visibility.length; i++) {
                    if (this.visibilityLayers[i] == false) continue;
                    if (this.visibility[i].ent_idx.includes(ent_idx)) {
                        show = true;
                        break;
                    }
                }
                if (!show) continue;
            }

            ent.render(this, this.renderInstList, viewerInput);
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
    constructor(public pathBase: string, public id: string, public name: string) {
    }

    public async createScene(device: GfxDevice, context: SceneContext): Promise<SceneGfx> {
        const assets = new AssetManager(this.pathBase);
        await assets.load(this.id, context);

        const sky_name = assets.world.skybox();
        let sky = undefined
        const ssky = assets.scripts.lookup_sky(sky_name.toLowerCase());
        if (ssky != undefined) {
            sky = ssky.sky;
            sky = await assets.load_geo(sky, context);
        }

        const entities_raw = assets.world.entities();
        const entities = [];
        for (const raw of entities_raw) {
            const ent = await load_entity(raw, assets, context);
            entities.push(ent);
        }

        return new RedlineRenderer(context, assets, sky, entities, assets.world.vis_sets().clusters);
    }
}

export const sceneGroup: SceneGroup = {
    id: "Redline",
    name: "Redline",

    sceneDescs: [
        "Tutorial",
        new RedlineSceneDesc("Redline", "footTraining.wld", "Foot Training"),
        new RedlineSceneDesc("Redline", "carTraining.wld", "Vehicle Training"),
        "Campaign",
        new RedlineSceneDesc("Redline", "Stadium_City.wld", "Stadium City"),
        new RedlineSceneDesc("Redline", "Yahoos.wld", "Yahoos"),
        new RedlineSceneDesc("Redline", "toxicorp.wld", "ToxiCorp"),
        new RedlineSceneDesc("Redline", "RED6.wld", "Red 6"),
        new RedlineSceneDesc("Redline", "AIRPORT.wld", "Airport"),
        new RedlineSceneDesc("Redline", "terminal.wld", "Airport Terminal"),
        new RedlineSceneDesc("Redline", "Freakway.wld", "Freakway"),
        new RedlineSceneDesc("Redline", "HubChallenge.wld", "Challenge"),
        new RedlineSceneDesc("Redline", "Sanctum.wld", "Sanctum"),
        new RedlineSceneDesc("Redline", "SanctumTower.wld", "Sanctum Tower"),
        new RedlineSceneDesc("Redline", "Boom.wld", "Boom"),
        new RedlineSceneDesc("Redline", "Area51.wld", "Area 51"),
        new RedlineSceneDesc("Redline", "Barrage.wld", "Barrage"),
        new RedlineSceneDesc("Redline", "Showdown.wld", "Showdown"),
        new RedlineSceneDesc("Redline", "ShowdownRant.wld", "Showdown Rant"),
        "Hub",
        // These are used for the pre-mission cinematics.
        // TODO: Determine if these are better inter-mixed with campaign missions
        new RedlineSceneDesc("Redline", "hub0.wld", "Hub0"),
        new RedlineSceneDesc("Redline", "hub1.wld", "Hub1"),
        new RedlineSceneDesc("Redline", "hub2.wld", "Hub2"),
        new RedlineSceneDesc("Redline", "hub3.wld", "Hub3"),
        new RedlineSceneDesc("Redline", "hub4.wld", "Hub4"),
        new RedlineSceneDesc("Redline", "hubchallenge.wld", "HubChallenge"),
        new RedlineSceneDesc("Redline", "areahub0.wld", "AreaHub0"),
        new RedlineSceneDesc("Redline", "areahub2.wld", "AreaHub2"),
        new RedlineSceneDesc("Redline", "areahub3.wld", "AreaHub3"),
        new RedlineSceneDesc("Redline", "areahub_final.wld", "AreaHub Final"),
        "Secret",
        new RedlineSceneDesc("Redline", "BeyondGames.wld", "BeyondGames"),
        "Unused",
        new RedlineSceneDesc("Redline", "stadiumfirstlev.wld", "Stadium City (alt)"),
        "Multiplayer",
        new RedlineSceneDesc("Redline", "acidland.wld", "Acidland"),
        new RedlineSceneDesc("Redline", "asphixia ctf.wld", "Asphixia CTF"),
        new RedlineSceneDesc("Redline", "bloodbucket.wld", "Blood Bucket"),
        new RedlineSceneDesc("Redline", "crimson nile ctf.wld", "Crimson Nile CTF"),
        new RedlineSceneDesc("Redline", "deathdome.wld", "Deathdome"),
        new RedlineSceneDesc("Redline", "denizone.wld", "Denizone"),
        new RedlineSceneDesc("Redline", "killcage.wld", "Killcage"),
        new RedlineSceneDesc("Redline", "octotron.wld", "Octotron"),
        new RedlineSceneDesc("Redline", "outpost.wld", "Outpost"),
        new RedlineSceneDesc("Redline", "ranthive.wld", "Rant Hive"),
        new RedlineSceneDesc("Redline", "slaughterhouse ctf.wld", "Slaughterhouse CTF"),
        new RedlineSceneDesc("Redline", "triagonizer.wld", "Triagonizer"),
        // Extras! Pre-release demos & cancelled sequel/spinoff
        "0.81 Multiplayer Demo",
        new RedlineSceneDesc("Redline/demo_081", "killcage.wld", "Killcage"),
        new RedlineSceneDesc("Redline/demo_081", "triagonizer-4t.wld", "Triagonizer"),
        "0.90 Demo",
        new RedlineSceneDesc("Redline/demo_090", "foottraining.wld", "Foot Training"),
        new RedlineSceneDesc("Redline/demo_090", "cartraining.wld", "Vehicle Training"),
        new RedlineSceneDesc("Redline/demo_090", "hub0.wld", "Hub 0"),
        new RedlineSceneDesc("Redline/demo_090", "stadium_city.wld", "Stadium City"),
        new RedlineSceneDesc("Redline/demo_090", "stadiumfirstlev.wld", "Stadium City (ALT)"),
        new RedlineSceneDesc("Redline/demo_090", "yahoos.wld", "Yahoos"),
        new RedlineSceneDesc("Redline/demo_090", "multi-airport.wld", "Airport"),
        new RedlineSceneDesc("Redline/demo_090", "triagonizer-4t.wld", "Triagonizer"),
        "Arena Demo (Cancelled Sequel/Spinoff)",
        new RedlineSceneDesc("Redline/ArenaDemo", "multiplayernet.wld", "Multiplayer Net"),
        new RedlineSceneDesc("Redline/ArenaDemo", "dckillcage.wld", "DC Killcage"),
        new RedlineSceneDesc("Redline/ArenaDemo", "dcterminal.wld", "DC Terminal"),
        new RedlineSceneDesc("Redline/ArenaDemo", "deathmatch.wld", "Deathmatch"),
        new RedlineSceneDesc("Redline/ArenaDemo", "lastmanstanding.wld", "Last Man Standing"),
    ],
};
