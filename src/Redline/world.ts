import { mat4, vec3 } from "gl-matrix";
import { rust } from "../rustlib";

export class World {
}

export class WorldGeometry {
    public mat: mat4;
    public model_index: number;

    constructor(entity: rust.RedlineEntity) {
        this.model_index = entity.model_idx;
        // Compute matrix
        const scale = vec3.fromValues(100, 100, 100);

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

        this.mat = mat;
    }
}
