
import { rust } from "../rustlib.js";
import { GfxDevice, GfxFormat, GfxInputLayout, GfxMipFilterMode, GfxProgram, GfxSampler, GfxTexFilterMode, GfxVertexBufferFrequency, GfxWrapMode } from "../gfx/platform/GfxPlatform";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase";
import { FakeTextureHolder } from "../TextureHolder";
import { SceneGfx, ViewerRenderInput } from "../viewer";
import * as UI from "../ui";

import { Texture } from "./material";
import { Geo } from "./geo";
import { GfxRenderHelper } from "../gfx/render/GfxRenderHelper.js";
import { GfxRenderCache } from "../gfx/render/GfxRenderCache.js";
import { DeviceProgram } from "../Program.js";
import { GfxShaderLibrary } from "../gfx/helpers/GfxShaderLibrary.js";
import { fillMatrix4x3, fillMatrix4x4 } from "../gfx/helpers/UniformBufferHelpers.js";
import { InputLayout } from "../DarkSouls/flver.js";
import { mat4, vec3 } from "gl-matrix";
import { GfxRenderInstList } from "../gfx/render/GfxRenderInstManager.js";
import { makeBackbufferDescSimple, standardFullClearRenderPassDescriptor } from "../gfx/helpers/RenderGraphHelpers.js";
import { GfxrAttachmentSlot } from "../gfx/render/GfxRenderGraph.js";

const pathBase = `Redline`;

class GeoProgram extends DeviceProgram {
    public static a_Position = 0;
    public static a_Color = 1;
    public static a_Uv = 2;
    public static a_Normal = 3;

    public static ub_SceneParams = 0;
    public static ub_Position = 1;

    public override vert = `
${GeoProgram.Common}

layout(location = ${GeoProgram.a_Position}) in vec3 a_Position;
layout(location = ${GeoProgram.a_Color}) in uint a_Color;
layout(location = ${GeoProgram.a_Uv}) in vec2 a_Uv;
layout(location = ${GeoProgram.a_Normal}) in vec3 a_Normal;

out vec2 v_TexCoord;

void main() {
    vec3 t_PositionWorld = (UnpackMatrix(u_WorldFromLocal) * vec4(-a_Position.x, a_Position.y, a_Position.z, 1.0f)).xyz;
    gl_Position = UnpackMatrix(u_ClipFromWorld) * vec4(t_PositionWorld, 1.0f);

    v_TexCoord = a_Uv.xy;
}
`;

    public override frag = `
${GeoProgram.Common}

in vec2 v_TexCoord;

void main() {
    gl_FragColor = texture(SAMPLER_2D(u_Texture), v_TexCoord.xy);
}
`;
    
    public static Common = `
${GfxShaderLibrary.MatrixLibrary}

layout(std140) uniform ub_SceneParams {
    Mat4x4 u_ClipFromWorld;
};

layout(std140) uniform ub_Position {
    Mat3x4 u_WorldFromLocal;
};

layout(location = 0) uniform sampler2D u_Texture;
`;
}

class RedlineRenderer implements SceneGfx {
    public textureHolder = new FakeTextureHolder([]);

    private renderHelper: GfxRenderHelper;
    private renderInstList = new GfxRenderInstList();

    private geoProgram: GfxProgram;
    private sampler: GfxSampler;

    private inputLayout: GfxInputLayout;

    constructor(
        private sceneContext: SceneContext,
        private textures: TextureCache,
        private model_table: string[],
        private models: Map<string, Geo>,
        private to_render: rust.RedlineEntity[],
    ) {
        this.renderHelper = new GfxRenderHelper(sceneContext.device, sceneContext);
        const cache = this.renderHelper.renderCache;

        this.geoProgram = cache.createProgram(new GeoProgram());
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
                    location: GeoProgram.a_Position,
                    format: GfxFormat.F32_RGB,
                    bufferByteOffset: 0,
                    bufferIndex: 0,
                },
                {
                    location: GeoProgram.a_Color,
                    format: GfxFormat.U8_RGBA_NORM,
                    bufferByteOffset: 12,
                    bufferIndex: 0,
                },
                {
                    location: GeoProgram.a_Uv,
                    format: GfxFormat.F32_RG,
                    bufferByteOffset: 12 + 4,
                    bufferIndex: 0,
                },
                {
                    location: GeoProgram.a_Normal,
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

        // Set ub_SceneParams
        const data = template.allocateUniformBufferF32(GeoProgram.ub_SceneParams, 16);
        let offs = 0;
        offs += fillMatrix4x4(data, offs, viewerInput.camera.clipFromWorldMatrix);

        // const model: Geo = this.models.get("f_arena1.newfreak")!;
        for (const m of this.to_render) {
            // console.log(this.model_table[m.model_idx]);
            const mdl = this.models.get(this.model_table[m.model_idx]);
            if (mdl == undefined) {
                // console.log(m.model_idx);
                continue;
            }
            const model = mdl!;
        for (const mesh of model.meshes) {
            const tex = this.textures.get(mesh.texture)?.gfxTexture;
            if (tex == undefined) continue; // TODO
        const renderInst = this.renderHelper.renderInstManager.newRenderInst();
        renderInst.setGfxProgram(this.geoProgram);

        const position = renderInst.allocateUniformBufferF32(GeoProgram.ub_Position, 12);
        const mat = mat4.create();
        const vr = m.pos();
        const rr = m.forward();
        const ur = m.up();
        const v = vec3.fromValues(-vr[0], vr[1], vr[2]);

        const f = vec3.fromValues(rr[0], rr[1], rr[2]);
        const u = vec3.fromValues(ur[0], ur[1], ur[2]);

        mat4.lookAt(mat, vec3.create(), f, u);
        mat4.translate(mat, mat, v);

        fillMatrix4x3(position, 0, mat);

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
            this.renderInstList.submitRenderInst(renderInst);
        }
        }

        const builder = this.renderHelper.renderGraph.newGraphBuilder();
        const mainColorDesc = makeBackbufferDescSimple(GfxrAttachmentSlot.Color0, viewerInput, standardFullClearRenderPassDescriptor);
        const mainDepthDesc = makeBackbufferDescSimple(GfxrAttachmentSlot.DepthStencil, viewerInput, standardFullClearRenderPassDescriptor);

        const mainColorTargetID = builder.createRenderTargetID(mainColorDesc, 'Main Color');
        const mainDepthTargetID = builder.createRenderTargetID(mainDepthDesc, 'Main Depth');

        builder.pushPass((pass) => {
            pass.setDebugName("Opaque Objects");

            pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mainColorTargetID);
            pass.attachRenderTargetID(GfxrAttachmentSlot.DepthStencil, mainDepthTargetID);

            pass.exec((passRenderer, scope) => {
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

        for (const mod of this.models.values()) {
            mod.destroy(device);
        }
        this.models.clear();
    }
}

class TextureCache {
    public inner: Map<string, Texture> = new Map();

    public get(key: string): Texture | undefined {
        return this.inner.get(key.toLowerCase())
    }

    public async preload(name: string, context: SceneContext) {
        name = name.toLowerCase();
        if (name == "" || this.inner.get(name) != undefined) return;

        const texture_file = name.replace(".tga", "").replace(".TGA", "") + ".btf";
        const raw = await context.dataFetcher.fetchData(`${pathBase}/${texture_file.toLowerCase()}`);
        this.inner.set(name, new Texture(name, context.device, raw));
    }

    public destroy(device: GfxDevice) {
        for (const tex of this.inner.values()) {
            tex.destroy(device);
        }
        this.inner.clear();
    }
}

class RedlineSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string) {
    }

    public async createScene(device: GfxDevice, context: SceneContext): Promise<SceneGfx> {
        const worldRaw = await context.dataFetcher.fetchData(`${pathBase}/${this.id}`);
        const world = rust.RedlineWorld.load(worldRaw.createTypedArray(Uint8Array));

        // Load base textures
        const textures = new TextureCache();
        for (const texture of world.list_textures()) {
            await textures.preload(texture, context);
        }

        // Load base models
        const models = new Map<string, Geo>();
        const model_table = world.list_models();
        for (let model of model_table) {
            model = model.toLowerCase();
            if (models.get(model) != undefined) continue;
            if (model[0] != "0") continue;
            const model_file = model.slice(1).toLowerCase() + ".geo";
            const raw = await context.dataFetcher.fetchData(`${pathBase}/${model_file}`);

            const mod =  new Geo(model.slice(1), device, raw);
            models.set(model.slice(1), mod);

            for (const mesh of mod.meshes) {
                // console.log(mesh.texture);
                await textures.preload(mesh.texture, context);
            }
        }

        const new_model_table = model_table.map((v) => v.slice(1).toLowerCase());
        console.log(model_table);
        console.log(new_model_table);

        const to_render = world.list_entities();
        for (const ent of to_render) {
             const x = new_model_table[ent.model_idx];
             if (models.get(x) == undefined) {
                 console.log(x);
             }
        }

        world.free();

        return new RedlineRenderer(context, textures, new_model_table, models, to_render);
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
