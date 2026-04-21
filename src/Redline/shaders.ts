
import { DeviceProgram } from "../Program";
import { GfxShaderLibrary } from "../gfx/helpers/GfxShaderLibrary.js";

export class VertexLitShader extends DeviceProgram {
    public static a_Position = 0;
    public static a_Color = 1;
    public static a_Uv = 2;
    public static a_Normal = 3;

    public static ub_SceneParams = 0;
    public static ub_Position = 1;

    public override vert = `
${VertexLitShader.Common}

layout(location = ${VertexLitShader.a_Position}) in vec3 a_Position;
layout(location = ${VertexLitShader.a_Color}) in vec4 a_Color;
layout(location = ${VertexLitShader.a_Uv}) in vec2 a_Uv;
layout(location = ${VertexLitShader.a_Normal}) in vec3 a_Normal;

out vec2 v_TexCoord;
out vec3 v_Color;

void main() {
    vec3 t_PositionWorld = (UnpackMatrix(u_WorldFromLocal) * vec4(-a_Position.x, a_Position.y, a_Position.z, 1.0f)).xyz;
    gl_Position = UnpackMatrix(u_ClipFromWorld) * vec4(t_PositionWorld, 1.0f);

    v_TexCoord = a_Uv.xy;
    v_Color = a_Color.bgr;
}
`;

    public override frag = `
${VertexLitShader.Common}

in vec2 v_TexCoord;
in vec3 v_Color;

void main() {
    gl_FragColor = texture(SAMPLER_2D(u_Texture), v_TexCoord.xy) * vec4(v_Color, 1);
    if(gl_FragColor.a < 0.01) {
        discard;
    }
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

export class FullbrightShader extends VertexLitShader {
    public override frag = `
${VertexLitShader.Common}

in vec2 v_TexCoord;
in vec3 v_Color;

void main() {
    gl_FragColor = texture(SAMPLER_2D(u_Texture), v_TexCoord.xy);
    if(gl_FragColor.a < 0.01) {
        discard;
    }
}
`;
}
