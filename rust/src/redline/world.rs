use deku::{DekuContainerRead, DekuRead};
use wasm_bindgen::prelude::*;

use crate::redline::read_len_string;
use crate::redline::read_len_string_vec;

#[derive(DekuRead, Debug)]
#[allow(unused)]
pub struct ExtendedHeader10 {
    #[deku(reader = "read_len_string(deku::reader)")]
    unk1: String,
    unk2: u32,
}

#[derive(DekuRead, Debug)]
#[allow(unused)]
pub struct ExtendedHeader12 {
    unk1: u32,
    unk2: u16,
    unk3: u16,
    unk4: u16,
}

#[derive(DekuRead, Debug)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
pub struct ExtendedHeader {
    #[deku(reader = "read_len_string(deku::reader)")]
    skybox: String,
    #[deku(reader = "read_len_string(deku::reader)")]
    unk1: String,
    unk2: u16,
    unk3: u16,
    unk4: u16,

    unk5: u32,
    unk6: u32,

    #[deku(cond = "version > 9")]
    ext_v10: Option<ExtendedHeader10>,
    #[deku(cond = "version > 0xb")]
    ext_v12: Option<ExtendedHeader12>,
}

#[derive(DekuRead, Debug)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
pub struct Texture {
    #[deku(reader = "read_len_string(deku::reader)")]
    name: String,
    #[deku(reader = "read_len_string(deku::reader)")]
    texture: String,
    #[deku(
        cond = "version > 0x1e",
        reader = "read_len_string(deku::reader).map(|x| Some(x))"
    )]
    unknown: Option<String>,

    unk1: u8,
    unk2: u8,
    unk3: u8,

    unk4: u32,
    unk5: u32,
    unk6: u32,
    unk7: u32,
    unk8: u32,
    unk9: u32,
}

#[derive(DekuRead, Debug)]
#[allow(unused)]
pub struct UnknownV39 {
    #[deku(reader = "read_len_string(deku::reader)")]
    unk1: String,
    unk2: u8,
    unk3: u8,
    unk4: u8,
    unk5: u8,
    unk6: u8,
    unk7: u8,
    unk8: u16,
    unk9: u32,
    unk10: u32,
    unk11: u32,
}

#[derive(DekuRead, Debug)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
struct Asset {
    #[deku(cond = "version > 1")]
    kind: u8,
    #[deku(reader = "read_len_string(deku::reader)")]
    name: String,
}

// World read directly from disk
#[derive(DekuRead, Debug)]
#[wasm_bindgen(js_name = "RedlineWorld")]
#[allow(unused)]
pub struct World {
    #[deku(assert_eq = "*b\"WLD\"")]
    magic: [u8; 3],
    #[deku(assert = "*version < 0x30")]
    version: u32,

    #[deku(cond = "*version > 0x24")]
    unk1: Option<[u8; 0x20]>,
    unk2: u32,
    unk3: u32,
    unk4: u32,

    /// Filename of .evt script
    #[deku(cond = "*version > 0x11")]
    evt_script: Option<[u8; 0x40]>,
    #[deku(cond = "*version > 0x28")]
    unk5: u16,
    #[deku(cond = "*version > 0x07", ctx = "*version")]
    extended_header: Option<ExtendedHeader>,
    #[deku(cond = "*version > 0x1f")]
    unk6: Option<u16>,
    // Materials
    texture_count: u16,
    #[deku(count = "*texture_count", ctx = "*version")]
    textures: Vec<Texture>,

    #[deku(cond = "*version > 0x27")]
    unk_v39_count: u16,
    #[deku(count = "*unk_v39_count")]
    unknown_v39: Vec<UnknownV39>,

    #[deku(cond = "*version > 0x10")]
    unk_v16_count: u16,
    #[deku(reader = "read_len_string_vec(deku::reader, *unk_v16_count)")]
    unk_v16: Vec<String>,

    // Models/Scripts/Animations
    asset_count: u32,
    #[deku(count = "*asset_count", ctx = "*version")]
    assets: Vec<Asset>,
}

#[wasm_bindgen(js_class = "RedlineWorld")]
impl World {
    pub fn load(raw: Vec<u8>) -> World {
        World::from_bytes((&raw, 0)).unwrap().1
    }

    /// Textures listed in core texture block. This is not exhaustive.
    pub fn list_textures(&self) -> Vec<String> {
        self.textures
            .iter()
            .map(|tex| tex.texture.clone())
            .collect()
    }

    /// Assets listed in the core asset block. This is not exhaustive.
    pub fn list_assets(&self) -> Vec<String> {
        self.assets.iter().map(|asset| asset.name.clone()).collect()
    }
}
