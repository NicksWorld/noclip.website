
import { rust } from "../rustlib.js";
import { GfxDevice, GfxFormat, GfxInputLayout, GfxMipFilterMode, GfxProgram, GfxSampler, GfxTexFilterMode, GfxVertexBufferFrequency, GfxWrapMode } from "../gfx/platform/GfxPlatform";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase";
import { FakeTextureHolder } from "../TextureHolder";
import { SceneGfx, ViewerRenderInput } from "../viewer";

import { GfxRenderHelper } from "../gfx/render/GfxRenderHelper.js";
import { fillMatrix4x3, fillMatrix4x4 } from "../gfx/helpers/UniformBufferHelpers.js";
import { mat4, vec3 } from "gl-matrix";
import { GfxRenderInstList } from "../gfx/render/GfxRenderInstManager.js";
import { makeBackbufferDescSimple, standardFullClearRenderPassDescriptor } from "../gfx/helpers/RenderGraphHelpers.js";
import { GfxrAttachmentSlot } from "../gfx/render/GfxRenderGraph.js";

import { Texture, TextureCache } from "./material";
import { Geo, GeoCache } from "./geo";
import { OpaqueShader } from "./shaders";

export const pathBase = `Redline`;

export class RedlineRenderer implements SceneGfx {
    public textureHolder = new FakeTextureHolder([]);

    private renderHelper: GfxRenderHelper;
    private renderInstList = new GfxRenderInstList();
    private skyRenderInstList = new GfxRenderInstList();

    private opaqueShaderProgram: GfxProgram;
    private sampler: GfxSampler;

    private inputLayout: GfxInputLayout;

    constructor(
        private sceneContext: SceneContext,
        public textures: TextureCache,
        private model_table: string[],
        private models: GeoCache,
        private skybox: string,
        private to_render: rust.RedlineEntity[],
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

        for (const tex of this.textures.inner.values()) {
            this.textureHolder.viewerTextures.push(tex);
        }
        this.textureHolder.onnewtextures();
    }

    private renderModel(inst: GfxRenderInstList, model: Geo, pos: mat4): void {
        for (const mesh of model.meshes) {
            const tex = this.textures.get(mesh.texture)?.gfxTexture;
            if (tex == undefined) continue; // TODO (vertex colored)
            const renderInst = this.renderHelper.renderInstManager.newRenderInst();
            renderInst.setGfxProgram(this.opaqueShaderProgram);

            const position = renderInst.allocateUniformBufferF32(OpaqueShader.ub_Position, 12);
            fillMatrix4x3(position, 0, pos);

            renderInst.setSamplerBindings(0, [
                {
                    gfxTexture: tex!,
                    gfxSampler: this.sampler,
                }
            ]);

            renderInst.setVertexInput(
                this.inputLayout,
                [{ buffer: model.vertexBuffer, byteOffset: mesh.vertexOffset * 9 * 4 }],
                { buffer: model.indexBuffer, byteOffset: mesh.indexOffset * 2 },
            );

            renderInst.setDrawCount(mesh.indexCount * 3);
            inst.submitRenderInst(renderInst);
        }
    }

    private renderEntity(inst: GfxRenderInstList, model: Geo, entity: rust.RedlineEntity) {
        const scale = vec3.fromValues(100, 100, 100);

        // Compute position matrix
        const r_position = entity.pos();
        const r_forward = entity.forward();
        const r_up = entity.up();
        const pos = vec3.create()
        vec3.mul(pos, vec3.fromValues(-r_position[0], r_position[1], r_position[2]), scale);

        const forward = vec3.fromValues(r_forward[0], r_forward[1], r_forward[2]);
        vec3.negate(forward, forward);
        let up = vec3.fromValues(r_up[0], r_up[1], r_up[2]);

        const rot = mat4.lookAt(mat4.create(), vec3.create(), forward, up);

        const mat = mat4.create();
        mat4.identity(mat);

        mat4.translate(mat, mat, pos);
        mat4.multiply(mat, mat, rot);
        mat4.scale(mat, mat, scale);

        this.renderModel(inst, model, mat);
    }

    private renderSky(pos: vec3) {
        const model = this.models.get(this.skybox.toLowerCase());
        if (!model) {
            console.log(this.skybox);
            return;
        }

        const mat = mat4.create();
        mat4.translate(mat, mat, pos);
        mat4.scale(mat, mat, [100, 100, 100]);

        this.renderModel(this.skyRenderInstList, model!, mat);
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

        // TODO: It looks like these are script defined geometry
        // const pos = vec3.create();
        // mat4.getTranslation(pos, viewerInput.camera.worldMatrix);
        // this.renderSky(pos);

        for (const entity of this.to_render) {
            const mdl = this.models.get(this.model_table[entity.model_idx]);
            if (mdl == undefined) {
                // Script object or Animated
                continue;
            }
            const model = mdl!;

            this.renderEntity(this.renderInstList, model, entity);
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
                this.skyRenderInstList.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
            });
        });

        builder.pushPass((pass) => {
            pass.setDebugName("Opaque Objects");

            pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mainColorTargetID);
            pass.attachRenderTargetID(GfxrAttachmentSlot.DepthStencil, mainDepthTargetID);

            pass.exec((passRenderer, _scope) => {
                this.renderInstList.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
            });
        });

        this.renderHelper.renderInstManager.popTemplate();
        this.renderHelper.debugDraw.pushPasses(builder, mainColorTargetID, mainDepthTargetID);
        this.renderHelper.antialiasingSupport.pushPasses(builder, viewerInput, mainColorTargetID);

        builder.resolveRenderTargetToExternalTexture(mainColorTargetID, viewerInput.onscreenTexture);
        this.renderHelper.prepareToRender();

        builder.execute();
    }

    public destroy(device: GfxDevice): void {
        this.textures.destroy(device);
        this.models.destroy(device);

        for (const entity of this.to_render) {
            entity.free()
        }
    }
}

class RedlineSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string) {
    }

    public async createScene(device: GfxDevice, context: SceneContext): Promise<SceneGfx> {
        const worldRaw = await context.dataFetcher.fetchData(`${pathBase}/${this.id.toLowerCase()}`);
        const world = rust.RedlineWorld.load(worldRaw.createTypedArray(Uint8Array));

        // Load base textures
        const textures = new TextureCache();
        for (const texture of world.list_textures()) {
            await textures.preload(texture, context);
        }

        // Load base models
        const models = new GeoCache();
        const asset_list = world.list_assets();
        const asset_table = [];
        for (const asset of asset_list) {
            console.log(asset_table.length + " " + asset.name);
            const name = asset.name.toLowerCase();
            asset_table.push(asset.kind == 0 ? name : "UNHANDLED");
            switch (asset.kind) {
                case 0:
                    if (models.get(name) != undefined) break;
                    const success = await models.preload(name, context, textures);
                    if (!success) console.log("Failed to load model: " + name);
                    break;
                default:
                    break;
            }

            asset.free();
        }

        const skybox = world.skybox();
        const to_render = world.list_entities();

        world.free();

        return new RedlineRenderer(context, textures, asset_table, models, skybox, to_render);
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
        // These are cinematic sections before levels. They may be better named and
        // sorted into the campaign section
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
