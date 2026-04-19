use deku::{DekuContainerRead, DekuRead};
use js_sys::{ArrayBuffer, Uint8Array};
use wasm_bindgen::prelude::*;

use crate::redline::read_padded_string;

#[derive(Clone, DekuRead, Debug)]
#[wasm_bindgen(js_name = "RedlineMesh", getter_with_clone)]
#[allow(unused)]
struct Mesh {
    #[deku(reader = "read_padded_string(deku::reader, 50)")]
    pub texture: String,
    #[deku(reader = "read_padded_string(deku::reader, 40)")]
    pub name: String,
    unk: u16,
    pub color: u32,
    pub vertex_offset: u16,
    pub vertex_count: u16,
    pub index_offset: u16,
    pub index_count: u16,
    pub render_flags: u8,
    unk2: u8,
    unk3: u16,
    unk4: u32,
}

#[derive(DekuRead, Debug)]
#[allow(unused)]
struct Vertex {
    pos: [f32; 3],
    color: [u8; 4],
    uv: [f32; 2],
    normal: [f32; 3],
}

impl Vertex {
    pub const SIZE: usize = 36;
}

#[derive(DekuRead, Debug)]
#[wasm_bindgen(js_name = "RedlineGeo")]
#[allow(unused)]
struct Geo {
    // Header
    #[deku(assert = "magic == b\"BGGF\"")]
    magic: [u8; 4],
    version: u32,
    index_count: u32,
    vertex_count: u32,
    mesh_count: u32,
    #[deku(cond = "*version != 1")]
    unk: u32,
    render_bbox: [[f32; 3]; 2],
    collision_bbox: [[f32; 3]; 2],

    // Data
    #[deku(count = "*mesh_count")]
    meshes: Vec<Mesh>,

    // Don't interpret the data, as it will be provided to JS via ArrayBuffers
    #[deku(count = "*index_count * 6")]
    index_buffer: Vec<u8>,
    #[deku(count = "*vertex_count as usize * Vertex::SIZE")]
    vertex_buffer: Vec<u8>,
}

#[wasm_bindgen(js_class = "RedlineGeo")]
impl Geo {
    pub fn load(raw: &[u8]) -> Geo {
        // TODO: Do post-processing on the vertex buffer, such as setting color to 0xFFFFFFFF for
        // fullbright
        Geo::from_bytes((raw, 0)).unwrap().1
    }

    pub fn index_buffer(&self) -> ArrayBuffer {
        let buf = Uint8Array::new_with_length(self.index_buffer.len() as u32);
        buf.copy_from(&self.index_buffer);

        buf.buffer()
    }

    pub fn vertex_buffer(&self) -> ArrayBuffer {
        let buf = Uint8Array::new_with_length(self.vertex_buffer.len() as u32);
        buf.copy_from(&self.vertex_buffer);

        buf.buffer()
    }

    pub fn meshes(&self) -> Vec<Mesh> {
        self.meshes.clone()
    }
}
