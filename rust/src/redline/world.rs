use deku::ctx::Order;
use deku::{DekuContainerRead, DekuRead};
use deku::{DekuError, DekuReader};
use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::redline::read_len_string;
use crate::redline::read_len_string_opt;
use crate::redline::read_len_string_vec;
use crate::redline::read_padded_string;

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
#[allow(unused)]
pub struct ExtendedHeader58 {
    unk1: u32,
    #[deku(reader = "read_len_string(deku::reader)")]
    unk2: String,
    #[deku(reader = "read_len_string(deku::reader)")]
    unk3: String,
    unk4: u32,
    unk5: u32,
    unk6: u32,
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

    unk5: f32,
    unk6: f32,

    #[deku(cond = "version > 9")]
    ext_v10: Option<ExtendedHeader10>,
    #[deku(cond = "version > 0xb")]
    ext_v12: Option<ExtendedHeader12>,
    #[deku(cond = "version > 0x29")]
    ext_v58: Option<ExtendedHeader58>,
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

    unk4: f32,
    unk5: f32,
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

#[derive(DekuRead, Debug, Clone)]
#[wasm_bindgen(js_name = "RedlineAssetDef", getter_with_clone)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
pub struct Asset {
    #[deku(cond = "version > 1")]
    pub kind: u8,
    #[deku(reader = "read_len_string(deku::reader)")]
    pub name: String,
}

#[derive(DekuRead, Debug)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
struct Unknown7 {
    #[deku(reader = "read_len_string(deku::reader)")]
    str: String,
    #[deku(cond = "version < 3")]
    val: u32, // Why more data in old versions?
}

#[derive(DekuRead, Serialize, Debug, Clone, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[wasm_bindgen(js_name = "RedlineWorldModel")]
#[ts(export, export_to = "redline.ts", rename = "EntityModel")]
pub struct Model {
    pub asset_idx: u16,
    pos: [f32; 3],
    forward: [f32; 3],
    up: [f32; 3],
    unk5: u16,
    #[deku(cond = "version > 0x10")]
    unk6: u16,
    #[deku(cond = "version > 0x18")]
    unk7: u16,
    #[deku(cond = "version > 0x18")]
    unk8: u8,
    #[deku(cond = "version > 0x21")]
    unk9: u32,
    #[deku(cond = "version > 0x23")]
    unk10: u32,
}

#[wasm_bindgen(js_class = "RedlineWorldModel")]
impl Model {
    pub fn pos(&self) -> Vec<f32> {
        Vec::from(self.pos)
    }
    pub fn forward(&self) -> Vec<f32> {
        Vec::from(self.forward)
    }
    pub fn up(&self) -> Vec<f32> {
        Vec::from(self.up)
    }
}

#[wasm_bindgen(js_class = "RedlineWorldAnim")]
impl Anim {
    pub fn pos(&self) -> Vec<f32> {
        Vec::from(self.pos)
    }
    pub fn forward(&self) -> Vec<f32> {
        Vec::from(self.forward)
    }
    pub fn up(&self) -> Vec<f32> {
        Vec::from(self.up)
    }
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "Entity4")]
pub struct Entity4 {
    unk1: [f32; 3],
    unk2: u16,
    #[deku(cond = "version < 0x21")]
    unk3: Option<[f32; 3]>,
    #[deku(cond = "version > 0x20")]
    unk4: Option<[f32; 10]>,

    unk5: u16,
    #[deku(cond = "version > 0xc")]
    unk6: u16,
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "Entity5")]
pub struct Entity5Ext {
    unk1: [u16; 6], // Not really an array
    #[deku(cond = "version > 0x16")]
    unk2: u8,
    #[deku(cond = "version > 0x16")]
    unk3: [f32; 3],
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "Entity5")]
pub struct Entity5 {
    unk1: [f32; 3],
    unk2: u16,
    #[deku(cond = "version < 0x14")]
    unk3: u16,
    #[deku(cond = "version > 0x13", ctx = "version")]
    unk4: Option<Entity5Ext>,
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "Entity6")]
pub struct Entity6 {
    unk1: [f32; 3],
    unk2: [u16; 5], // Not really array
    unk3: u8,
    unk4: u8,
    unk5: u16,
    unk6: u8,
    unk7: u8,
    unk8: u8,
    unk9: u8,
    #[deku(cond = "version > 0xf")]
    unk10: f32,
    #[deku(cond = "version > 0xf")]
    unk11: f32,
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "Entity7")]
pub struct Entity7 {
    unk1: [f32; 3],
    unk2: u16,
    unk3: u16,
    #[deku(reader = "read_len_string(deku::reader)")]
    unk4: String,
    #[deku(cond = "version > 0x1a")]
    unk5: u16,
    #[deku(cond = "version > 0x21")]
    unk6: u32,
    #[deku(cond = "version > 0x25")]
    unk7: u16,
    #[deku(cond = "version > 0x25")]
    unk8: u16,
    #[deku(cond = "version > 0x25")]
    unk9: u16,
}

#[derive(DekuRead, Debug, Clone, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[wasm_bindgen(js_name = "RedlineWorldAnim")]
#[ts(export, export_to = "redline.ts", rename = "EntityAnim")]
pub struct Anim {
    pub asset_idx: u16,
    pos: [f32; 3],
    forward: [f32; 3],
    up: [f32; 3],
    unk5: u16,
    #[deku(cond = "version > 0x19")]
    unk6: u16,
    #[deku(cond = "version > 0x19")]
    unk7: u8,
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "Entity2Ext")]
pub struct Entity2Ext {
    unk1: u32,
    unk2: u32,
    #[deku(cond = "version < 0x24")]
    unk3: u8,
    #[deku(cond = "version > 0x23")]
    unk4: u32,

    unk5: u8,
    unk6: u8,
    unk7: u8,
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "EntityPerson")]
pub struct Person {
    pos: [f32; 3],
    unk2: u16,
    unk3: u16,
    unk4: u8,
    #[deku(cond = "version > 0x15")]
    unk5: u16,
    #[deku(reader = "read_len_string(deku::reader)")]
    person_script: String,
    #[deku(reader = "read_len_string(deku::reader)")]
    ai_foot: String,

    #[deku(cond = "version > 8", reader = "read_len_string_opt(deku::reader)")]
    ai_car: Option<String>,
    #[deku(cond = "version > 0x1b", reader = "read_len_string_opt(deku::reader)")]
    unk9: Option<String>, // 0xe0
    #[deku(cond = "version > 0x23", reader = "read_len_string_opt(deku::reader)")]
    custom_item: Option<String>,

    #[deku(cond = "version > 0x22", ctx = "version")]
    unk11: Option<Entity2Ext>,
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "EntityCar")]
pub struct Car {
    pos: [f32; 3],
    unk2: u16,
    unk3: u16,
    unk4: u8,
    #[deku(reader = "read_len_string(deku::reader)")]
    name: String,
    #[deku(cond = "version > 0x1c")]
    unk6: u32,
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "EntitySoundEffect")]
pub struct SoundEffect {
    unk1: [f32; 3],
    unk2: u16,
    unk3: u16,
    #[deku(reader = "read_len_string(deku::reader)")]
    name: String,

    #[deku(cond = "version > 0xa")]
    unk5: u16,
    #[deku(cond = "version > 0xa")]
    unk6: u16,

    #[deku(cond = "version > 0x25")]
    unk7: u16,
    #[deku(cond = "version > 0x25")]
    unk8: u16,
    #[deku(cond = "version > 0x25")]
    unk9: u16,
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "EntityItem")]
pub struct Item {
    pos: [f32; 3],
    unk2: u16,
    unk3: u16,
    #[deku(reader = "read_len_string(deku::reader)")]
    name: String,
    #[deku(cond = "version > 0x24")]
    unk5: u16,
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "Entity12")]
pub struct Entity12 {
    unk1: [f32; 3],
    unk2: u16,
    #[deku(cond = "version < 0x21")]
    unk3: [f32; 3],
    #[deku(cond = "version > 0x20")]
    unk4: [f32; 10],
    unk5: u16,
    #[deku(cond = "version > 0x26")]
    unk6: u16,
    #[deku(cond = "version > 0x27")]
    unk7: f32,
    #[deku(cond = "version > 0x27", reader = "read_len_string_opt(deku::reader)")]
    unk8: Option<String>,
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "Entity13")]
pub struct Entity13 {
    unk1: [f32; 3],
    unk2: u16,
    unk3: u16,
    unk4: u16,
    unk5: u16,
    unk6: u16,
    unk7: u16,
    unk8: u16,
    unk9: u32,
    unk10: u16,
}

#[derive(DekuRead, Debug, Serialize, ts_rs::TS)]
#[deku(ctx = "version: u32")]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "Entity15")]
pub struct Entity15 {
    unk1: [f32; 3],
    unk2: u16,
    unk3: u16,
    unk4: u16,
    unk5: u8,
    #[deku(reader = "read_len_string(deku::reader)")]
    unk6: String,
}

#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export, export_to = "redline.ts", rename = "Entity")]
#[allow(unused)]
pub enum WorldEntity {
    Model(Model),
    Anim(Anim),
    Person(Person), // Enemy spawnpoints?
    Car(Car),
    Unknown4(Entity4),
    Unknown5(Entity5),
    Unknown6(Entity6),
    Unknown7(Entity7),
    SoundEffect(SoundEffect),
    Item(Item), // Pickups
    Unknown12(Entity12),
    Unknown13(Entity13),
    Unknown15(Entity15),
}

fn read_world_entity<R: std::io::Read + std::io::Seek>(
    reader: &mut deku::reader::Reader<R>,
    version: u32,
) -> Result<Vec<WorldEntity>, DekuError> {
    let mut out = vec![];
    loop {
        let mut tag = [0u8; 1];
        reader.read_bytes_const(&mut tag, Order::Msb0)?;

        // TODO: version < 6
        out.push(match tag[0] {
            0x00 => WorldEntity::Model(Model::from_reader_with_ctx(reader, version)?),
            0x01 => WorldEntity::Anim(Anim::from_reader_with_ctx(reader, version)?),
            0x02 => WorldEntity::Person(Person::from_reader_with_ctx(reader, version)?),
            0x03 => WorldEntity::Car(Car::from_reader_with_ctx(reader, version)?),
            0x04 => WorldEntity::Unknown4(Entity4::from_reader_with_ctx(reader, version)?),
            0x05 => WorldEntity::Unknown5(Entity5::from_reader_with_ctx(reader, version)?),
            0x06 => WorldEntity::Unknown6(Entity6::from_reader_with_ctx(reader, version)?),
            0x07 => WorldEntity::Unknown7(Entity7::from_reader_with_ctx(reader, version)?),
            0x08 => WorldEntity::SoundEffect(SoundEffect::from_reader_with_ctx(reader, version)?),
            0x09 => WorldEntity::Item(Item::from_reader_with_ctx(reader, version)?),
            0x0C => WorldEntity::Unknown12(Entity12::from_reader_with_ctx(reader, version)?),
            0x0D => WorldEntity::Unknown13(Entity13::from_reader_with_ctx(reader, version)?),
            0x0F => WorldEntity::Unknown15(Entity15::from_reader_with_ctx(reader, version)?),
            0xFF => break, // End condition
            _ => {
                break;
            } // TODO
        });
    }

    Ok(out)
}

// World read directly from disk
#[derive(DekuRead, Debug)]
#[wasm_bindgen(js_name = "RedlineWorld")]
#[allow(unused)]
pub struct World {
    #[deku(assert_eq = "*b\"WLD\"")]
    magic: [u8; 3],
    #[deku(assert = "*version < 0x2b")]
    version: u32,

    #[deku(cond = "*version > 0x24")]
    unk1: Option<[u8; 0x20]>,
    unk2: u32,
    unk3: u32,
    unk4: u32,

    /// Filename of .evt script
    #[deku(
        cond = "*version > 0x11",
        reader = "read_padded_string(deku::reader, 0x40).map(|x| Some(x))"
    )]
    evt_script: Option<String>,
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

    // More models, but only a couple?
    #[deku(cond = "*version > 0x10")]
    unk_v16_count: u16,
    #[deku(reader = "read_len_string_vec(deku::reader, *unk_v16_count)")]
    unk_v16: Vec<String>,

    // Models/Scripts/Animations
    asset_count: u32,
    #[deku(count = "*asset_count", ctx = "*version")]
    assets: Vec<Asset>,

    unk7_count: u32,
    #[deku(count = "*unk7_count", ctx = "*version")]
    unk7: Vec<Unknown7>,

    // Large list of unions. Likely all world entities
    #[deku(reader = "read_world_entity(deku::reader, *version)")]
    entities: Vec<WorldEntity>,
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
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
    pub fn list_assets(&self) -> Vec<Asset> {
        self.assets.clone()
    }

    pub fn skybox(&self) -> String {
        self.extended_header
            .as_ref()
            .map(|x| x.skybox.clone())
            .unwrap_or_default()
    }

    pub fn entities(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.entities).unwrap()
    }
}
