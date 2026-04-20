
import { rust } from "../rustlib.js";
import { GfxAttachmentState, GfxBlendFactor, GfxBlendMode, GfxChannelWriteMask, GfxDevice, GfxFormat, GfxInputLayout, GfxMipFilterMode, GfxProgram, GfxSampler, GfxTexFilterMode, GfxVertexBufferFrequency, GfxWrapMode } from "../gfx/platform/GfxPlatform";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase";
import { FakeTextureHolder } from "../TextureHolder";
import { SceneGfx, ViewerRenderInput } from "../viewer";

import { GfxRenderHelper } from "../gfx/render/GfxRenderHelper.js";
import { fillMatrix4x3, fillMatrix4x4 } from "../gfx/helpers/UniformBufferHelpers.js";
import { mat4, vec3 } from "gl-matrix";
import { GfxRenderInstList } from "../gfx/render/GfxRenderInstManager.js";
import { makeBackbufferDescSimple, standardFullClearRenderPassDescriptor } from "../gfx/helpers/RenderGraphHelpers.js";
import { GfxrAttachmentSlot } from "../gfx/render/GfxRenderGraph.js";

import { Texture } from "./material";
import { Geo} from "./geo";
import { OpaqueShader } from "./shaders";
import { loadPcScript } from "./script.js";
import { WorldGeometry } from "./world.js";
import { AssetManager } from "./assets.js";

export const pathBase = `Redline`;

class RedlineRenderInstList {
    public opaque: GfxRenderInstList = new GfxRenderInstList();
    public transparent: GfxRenderInstList = new GfxRenderInstList();
}

type RedlineAsset = Geo | undefined;

const attachmentStatesAdditive: GfxAttachmentState[] = [{
    alphaBlendState: {blendMode: GfxBlendMode.Add, blendDstFactor: GfxBlendFactor.One, blendSrcFactor: GfxBlendFactor.SrcAlpha},
    channelWriteMask: GfxChannelWriteMask.AllChannels,
    rgbBlendState: {blendMode: GfxBlendMode.Add, blendDstFactor: GfxBlendFactor.OneMinusSrc, blendSrcFactor: GfxBlendFactor.SrcAlpha}
}];

export class RedlineRenderer implements SceneGfx {
    public textureHolder = new FakeTextureHolder([]);

    private renderHelper: GfxRenderHelper;
    private renderInstList = new RedlineRenderInstList();
    private skyRenderInstList = new RedlineRenderInstList();

    private opaqueShaderProgram: GfxProgram;
    private sampler: GfxSampler;

    private inputLayout: GfxInputLayout;

    constructor(
        private sceneContext: SceneContext,
        public assets: AssetManager,
        private asset_table: RedlineAsset[],
        private to_render: WorldGeometry[],
    ) {
        this.renderHelper = new GfxRenderHelper(sceneContext.device, sceneContext);
        const cache = this.renderHelper.renderCache;

        this.opaqueShaderProgram = cache.createProgram(new OpaqueShader());
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
                    location: OpaqueShader.a_Position,
                    format: GfxFormat.F32_RGB,
                    bufferByteOffset: 0,
                    bufferIndex: 0,
                },
                {
                    location: OpaqueShader.a_Color,
                    format: GfxFormat.U8_RGBA_NORM,
                    bufferByteOffset: 12,
                    bufferIndex: 0,
                },
                {
                    location: OpaqueShader.a_Uv,
                    format: GfxFormat.F32_RG,
                    bufferByteOffset: 12 + 4,
                    bufferIndex: 0,
                },
                {
                    location: OpaqueShader.a_Normal,
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

    private renderModel(inst: RedlineRenderInstList, model: Geo, pos: mat4): void {
        for (const mesh of model.meshes) {
            if (mesh.texture == "") continue;
            const tex = this.assets.get_texture(mesh.texture);
            if (tex == undefined) continue; // TODO (vertex colored)
            const renderInst = this.renderHelper.renderInstManager.newRenderInst();

            let inst_list = inst.opaque;

            // Determine correct shader program
            if ((mesh.renderFlags & 0x01) != 0) {
                renderInst.setGfxProgram(this.opaqueShaderProgram);
                renderInst.setMegaStateFlags({
                    depthWrite: false,
                    attachmentsState: attachmentStatesAdditive,
                });
                inst_list = inst.transparent;
            } else {
                renderInst.setGfxProgram(this.opaqueShaderProgram);
            }

            const position = renderInst.allocateUniformBufferF32(OpaqueShader.ub_Position, 12);
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

        const data = template.allocateUniformBufferF32(OpaqueShader.ub_SceneParams, 16);
        let offs = 0;
        offs += fillMatrix4x4(data, offs, viewerInput.camera.clipFromWorldMatrix);

        for (const entity of this.to_render) {
            const mdl = this.asset_table[entity.model_index]!;
            if (mdl == undefined) {
                // Script object or Animated
                continue;
            }
            const model = mdl!;

            this.renderModel(this.renderInstList, model, entity.mat);
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
                case 2:
                    const s = assets.scripts.lookup_object(name);
                    if (s != undefined) {
                        name = s.geo.toLowerCase().replace(".geo", "");
                        if (s.unk9.name != "") {
                            // Appears to be the spawn point of non-enemy NPCs.
                            // Should override the default model
                            name = "";
                        }
                    } else {
                        name = "";
                    }
                    if (s != undefined) {
                        s.free();
                    }
                case 0:
                    const model = await assets.load_geo(name, context);
                    asset_table.push(model);
                    break;
                default:
                    asset_table.push(undefined);
                    console.log("Unhandled asset type: " + asset.kind);
                    break;
            }

            asset.free();
        }

        const world_geo = assets.world.list_entities();
        const to_render = [];
        for (const geo of world_geo) {
            to_render.push(new WorldGeometry(geo));
            geo.free();
        }

        return new RedlineRenderer(context, assets, asset_table, to_render);
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
