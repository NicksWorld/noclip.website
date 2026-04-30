use deku::{ctx::Order, reader::Reader, DekuContainerRead, DekuError, DekuRead, DekuReader};
use serde::Serialize;
use std::{collections::HashMap, convert::TryInto, io::Cursor};
use wasm_bindgen::prelude::*;

use crate::redline::read_padded_string;

#[derive(Debug)]
struct ScriptEntry {
    // Data stored within the primary entry
    data: Vec<u8>,
    // Extended variable-length data stored after the entry block
    ext_data: Vec<u8>,
}

#[derive(Debug, Default)]
struct ScriptSection {
    descriptors: Vec<Descriptor>,
    // Map to facilitate quicker lookup of named scripts
    lookup_map: HashMap<String, usize>,
    // Raw entry data. First vec is the primary
    entries: Vec<ScriptEntry>,
}

#[derive(Debug)]
#[allow(unused)]
#[wasm_bindgen(js_name = "RedlineScript")]
struct PCScript {
    sections: [Option<ScriptSection>; 0x28],
    version: ScriptVersion,
}

struct RawCursor<'a> {
    inner: &'a [u8],
    pos: usize,
}

impl<'a> RawCursor<'a> {
    pub fn read_u32(&mut self) -> u32 {
        let v = u32::from_le_bytes(self.inner[self.pos..self.pos + 4].try_into().unwrap());
        self.pos += 4;
        v
    }
    pub fn read_u16(&mut self) -> u16 {
        let v = u16::from_le_bytes(self.inner[self.pos..self.pos + 2].try_into().unwrap());
        self.pos += 2;
        v
    }
    pub fn read_bytes(&mut self, len: usize) -> &'a [u8] {
        let v = &self.inner[self.pos..self.pos + len];
        self.pos += len;
        v
    }
    pub fn read_padded_string(&mut self, len: usize) -> String {
        let raw = self.read_bytes(len);
        String::from_utf8_lossy(
            &raw.into_iter()
                .cloned()
                .take_while(|v| *v != 0)
                .collect::<Vec<u8>>(),
        )
        .to_string()
    }
}

#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "ScriptDescriptor")]
struct Descriptor {
    kind: u16,
    offset: u16,
    named: u16, // 1 or 0
    name: String,
}

#[derive(Clone, Copy, PartialEq, PartialOrd, Debug)]
#[wasm_bindgen(js_name = "RedlineScriptVersion")]
#[repr(u8)]
pub enum ScriptVersion {
    Demo0_81,
    Demo0_90,
    Release1_0,
    Arena,
}

#[non_exhaustive]
#[allow(unused)]
enum ScriptKind {
    Cars = 0x0,
    Sky = 0x1,
    Includes = 0x2,
    AIs = 0x3, // Foot or Car
    Surfaces = 0x4,
    Impacts = 0x5,
    Weapons = 0x6, // Unverified
    Persons = 0x7,
    Projectiles = 0x8, // Unverified - very uncertain
    Objects = 0x9,
    Dashboard = 0xA,
    Instruments = 0xB,
    AnimDesc = 0xC,
    SoundLists = 0xD,
    Sounds = 0xE,
    Particles = 0xF,
    EventSequenceList = 0x10,
    EmitterArray = 0x11, // EventSequences
    Emitter = 0x12,      // EventFrames
    SubEmitter = 0x13,   // Events
    MiscData = 0x14,
    Blasts = 0x15,
    Trails = 0x16,
    Item = 0x17,
    Light = 0x18,
    GeneralFloat = 0x19,
    Motion = 0x1A,
    DamageState = 0x1B,
    Bushes = 0x1C,
    // Unhandled = 0x1D
    Critter = 0x1E,
    CritterStateWander = 0x1F,
    CritterStateRest = 0x20,
    CritterStateHit = 0x21,
    CritterStateFlee = 0x22,
    CritterStateAttack = 0x23,
    CritterStateFollow = 0x24,
    CritterStateMerge = 0x25,
    CameraShake = 0x26,
}

// Handler method pointers are stored at 0x5CC794 + (id * 8).
// Not every type has one, but those that do typically load or lookup a asset or script
#[non_exhaustive]
#[allow(unused)]
enum DescriptorKind {
    Script = 0x0, // Looked up in section defined by field + 0x14
    Geometry = 0x1,
    Animation = 0x2,
    I16 = 0x3, // i16 type
    GeometryAgain = 0x6,
    SFX = 0x8,
    Sprite = 0x9,
    Float = 0xA, // f32 type
    // See FUN_0052e956 for init handler
    // data is count, extdata is i16 script section, followed by string name
    ScriptArray = 0xC,
    ArraySomethingElse = 0xE,         // Array, looked up in section 6
    ArraySomethingElseEntirely = 0xF, // Array, looked up in section 11 (0xB)
    DoNothing = 0x12,                 // Handler just returns 1?
    DoNothingMuch = 0x14,             // Handler sets off + 0x10 to 0xFFFF
    Motion = 0x15,
    Skeleton = 0x16,
    Something = 0x17, // Looked up in section 0x1B
    // See FUN_0052e7a1 for init handler
    MultipleGeo = 0x19,
}

#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[allow(unused)]
#[wasm_bindgen(js_name = "RedlineScriptRef", getter_with_clone, inspectable)]
#[ts(export, export_to = "redline.ts", rename = "ScriptRef")]
struct ScriptRef {
    pub name: String,
    pub kind: u16,
}

impl ScriptRef {
    fn read<R: std::io::Read + std::io::Seek>(
        reader: &mut deku::reader::Reader<R>,
    ) -> Result<ScriptRef, deku::DekuError> {
        let name = read_padded_string(reader, 0x14)?;
        let mut kind = [0u8; 4];
        reader.read_bytes_const(&mut kind, Order::Msb0)?;
        Ok(ScriptRef {
            name,
            kind: u16::from_le_bytes(kind[0..2].try_into().unwrap()),
        })
    }
}

#[derive(Debug, DekuRead, Serialize, ts_rs::TS)]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "ScriptSky")]
struct Sky {
    #[deku(reader = "read_padded_string(deku::reader, 18)")]
    pub name: String,
    #[deku(reader = "read_padded_string(deku::reader, 36)")]
    pub sky: String,
}

#[derive(Debug, DekuRead, Serialize, ts_rs::TS)]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "ScriptAnimDesc")]
struct AnimDesc {
    #[deku(reader = "read_padded_string(deku::reader, 18)")]
    pub name: String,
    #[deku(reader = "read_padded_string(deku::reader, 38)")]
    pub anim: String,
    #[deku(reader = "ScriptRef::read(deku::reader)")]
    pub unk: ScriptRef,
    /// 1 = forward, -1 = reverse
    pub dir: i16,
    pub scale_x: f32,
    pub scale_y: f32,
    pub scale_z: f32,
}

#[derive(Debug, DekuRead, Serialize, ts_rs::TS)]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "ScriptObject")]
struct Object {
    #[deku(reader = "read_padded_string(deku::reader, 18)")]
    pub name: String,
    /// Base geometry (can be none)
    #[deku(reader = "read_padded_string(deku::reader, 36)")]
    pub geo: String,
    /// 1 = yes
    pub transparent: i16,
    /// 0 = indestructible, - = no collision
    pub hitpoints: i16,
    pub respawn_delay: i16,
    /// - = immobile
    pub mass: f32,
    #[deku(reader = "ScriptRef::read(deku::reader)")]
    pub unk: ScriptRef,
    #[deku(reader = "ScriptRef::read(deku::reader)")]
    pub unk1: ScriptRef,
    #[deku(reader = "ScriptRef::read(deku::reader)")]
    pub unk2: ScriptRef,
    #[deku(reader = "ScriptRef::read(deku::reader)")]
    pub unk3: ScriptRef,
    #[deku(reader = "ScriptRef::read(deku::reader)")]
    pub unk4: ScriptRef,
    pub emitter_release_delay_min: i16,
    pub min_hitpoints: i16,
    pub rotation_speed: f32,
    pub emitter_x: f32,
    pub emitter_y: f32,
    pub emitter_z: f32,
    pub weight: f32,
    pub delay_before_carcass: i16,
    #[deku(pad_bytes_before = "2", reader = "ScriptRef::read(deku::reader)")]
    pub unk5: ScriptRef,
    #[deku(reader = "ScriptRef::read(deku::reader)")]
    pub unk6: ScriptRef,
    pub draw_flags: i16,
    #[deku(pad_bytes_before = "2", reader = "ScriptRef::read(deku::reader)")]
    pub unk7: ScriptRef,
    #[deku(reader = "ScriptRef::read(deku::reader)")]
    pub unk8: ScriptRef,
    #[deku(reader = "ScriptRef::read(deku::reader)")]
    pub anim: ScriptRef,
    pub visible_range: f32,
    pub emitter_rnd_release: i16,
}

#[derive(DekuRead, Clone, Debug, Serialize, ts_rs::TS)]
#[allow(unused)]
#[wasm_bindgen(js_name = "RedlineScriptArray", getter_with_clone, inspectable)]
#[ts(export, export_to = "redline.ts", rename = "ScriptRefArray")]
struct ScriptArray {
    pub count: u16,
    #[deku(pad_bytes_after = "4")]
    pub kind: u16,
    #[deku(skip)]
    pub scripts: Vec<String>,
}

impl ScriptArray {
    // Read script array refs
    // The references are 20 bytes, the first 4 being a placeholder for the insertion of
    // live pointers to the referenced scripts at runtime.
    fn populate(&mut self, raw: &[u8]) -> usize {
        for i in 0..self.count as usize {
            self.scripts.push(
                String::from_utf8_lossy(
                    &raw[i * 20..]
                        .into_iter()
                        .cloned()
                        .take(20)
                        .skip(4)
                        .take_while(|v| *v != 0)
                        .collect::<Vec<u8>>(),
                )
                .to_string(),
            )
        }

        20 * (self.count as usize)
    }
}

#[derive(Debug, DekuRead, Serialize, ts_rs::TS)]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "ScriptEmitterArray")]
struct EmitterArray {
    #[deku(reader = "read_padded_string(deku::reader, 18)")]
    pub name: String,
    pub repeat_count: u16,
    pub scripts: ScriptArray,
    // Can be 0 or 1
    pub attach_to_launcher: u16,
}

#[derive(Debug, DekuRead, Serialize, ts_rs::TS)]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "ScriptEmitter")]
struct Emitter {
    #[deku(reader = "read_padded_string(deku::reader, 18)")]
    pub name: String,
    pub repeat_count: u16,
    pub sleep_count: u16,

    #[deku(pad_bytes_before = "2")]
    pub unk1: ScriptArray,
    pub unk2: ScriptArray,
    pub unk3: ScriptArray,
}

#[derive(Debug, DekuRead, Serialize, ts_rs::TS)]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "ScriptSubEmitter")]
struct SubEmitter {
    #[deku(reader = "read_padded_string(deku::reader, 18)")]
    name: String,
    repeat_event: i16,
    xz_damp: f32,
    y_damp: f32,
    xz_min_speed: f32,
    xz_speed_range: f32,
    xz_min_angle: i16,
    xz_angle_range: i16,
    xz_angle_incr: i16,
    #[deku(pad_bytes_before = "2")]
    y_min_speed: f32,
    y_speed_range: f32,
    y_gravity: f32,
    y_offset: f32,
    x_offset: f32,
    z_offset: f32,

    y_offset_range: f32,
    x_offset_range: f32,
    z_offset_range: f32,
    // Following are one descriptor, type uncertain
    #[deku(pad_bytes_before = "96 - 80")]
    y_min_angle_range: f32,
    y_min_angle_range2: f32,

    #[deku(reader = "ScriptRef::read(deku::reader)")]
    unk: ScriptRef,
    unk1: ScriptArray,
    unk2: ScriptArray,
}

#[derive(Debug, DekuRead, Serialize, ts_rs::TS)]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "ScriptSprite")]
struct Sprite {
    #[deku(reader = "read_padded_string(deku::reader, 18)")]
    name: String,
    //#[deku(
    //    pad_bytes_before = "2",
    //    reader = "read_padded_string(deku::reader, 68 - 20)"
    //)]
    //sprite: String,
    #[deku(
        pad_bytes_before = "2",
        reader = "read_padded_string(deku::reader, 0x24)"
    )]
    sprite_name: String,
    // Divisions separating individual frames?
    sprite_div_x: i8,
    sprite_div_y: i8,

    // Scale or texture size? Unsure.
    sprite_sizing: i16,
    // No clue, typically 0
    sprite_unk4: i16,
    // No clue, typically 1
    sprite_unk5: i16,

    #[deku(pad_bytes_before = "4")]
    #[deku(reader = "read_padded_string(deku::reader, 172 - 68)")]
    sprite2: String,

    zbuffer_test: i16,
    #[deku(pad_bytes_before = "2")]
    initial_scale: f32,
    scale1_add_target: f32,
    scale1_add_target2: f32,
    fuse: i16,
    collision: i16,
    last_frame_hold_flag: i16,
    frame_hold_amount: i16,
    priority: i16,
    rgb: u32,
    // Probably not split right
    rotation_init_add: u16,
    rotation_init_add2: u32,

    scale2_add_target: f32,
    scale2_add_target2: f32,

    y_speed_init_random_add: u32,
    y_speed_init_random_add2: u32,

    fade_speed: i16,
    fade_delay: i16,
    final_rgb: u32,
    fade_delay2: i16,
    #[deku(pad_bytes_before = "2")]
    gravity: f32,
    fade_speed_2: i16,
    final_rgb2: u32,

    #[deku(pad_bytes_before = "2")]
    xz_speed_init_add: u32,
    xz_speed_init_add2: u32,
}

#[derive(Debug, DekuRead, Serialize, ts_rs::TS)]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "ScriptItem")]
#[deku(ctx = "version: ScriptVersion")]
struct Item {
    #[deku(reader = "read_padded_string(deku::reader, 18)")]
    name: String,
    #[deku(reader = "read_padded_string(deku::reader, 36)")]
    geo: String,
    // 1 = yes
    transparent: i16,
    hitpoints: i16,
    respawn_delay: i16,
    rotation_speed: f32,

    #[deku(reader = "ScriptRef::read(deku::reader)")]
    pickup_emit: ScriptRef,
    #[deku(reader = "ScriptRef::read(deku::reader)")]
    respawn_emit: ScriptRef,

    unk3: u32, //datatype unsure
    #[deku(count = "64")]
    unk4: Vec<u8>, // Looks like an ascii text descriptor, then pickup data?
    pickup_flags: i16,
    delay_min_rng: [u8; 6],
    emitter_x: f32,
    emitter_y: f32,
    emitter_z: f32,

    #[deku(reader = "ScriptRef::read(deku::reader)")]
    unk5: ScriptRef,
    droppable_flag: i16,
    #[deku(
        cond = "version < ScriptVersion::Release1_0",
        reader = "ScriptRef::read(deku::reader).map(|x| Some(x))",
        pad_bytes_before = "2"
    )]
    unk6: Option<ScriptRef>,
}

#[allow(unused)]
#[wasm_bindgen(js_class = "RedlineScript")]
impl PCScript {
    pub fn load(raw: &[u8], version: ScriptVersion) -> PCScript {
        let mut script = PCScript {
            sections: [const { None }; 0x28],
            version: version,
        };

        let mut cursor = RawCursor { inner: raw, pos: 0 };

        let _file_length = cursor.read_u32();
        let version = cursor.read_u32();
        assert!(version >= 3);

        let section_count = cursor.read_u16();

        cursor.read_u16(); // unused
        for _ in 0..section_count {
            let mut section = ScriptSection::default();

            cursor.read_u16(); // unused
            let section_id = cursor.read_u16();
            let stride = cursor.read_u16();
            assert_eq!(stride, 0x26);
            let desc_count = cursor.read_u16();

            section.descriptors = Vec::with_capacity(desc_count as usize);
            for _ in 0..desc_count {
                section.descriptors.push(Descriptor {
                    kind: cursor.read_u16(),
                    offset: cursor.read_u16(),
                    named: cursor.read_u16(),
                    name: cursor.read_padded_string(0x20),
                });
            }

            // Header before entries
            let entry_len = cursor.read_u16();
            let entry_count = cursor.read_u16();

            // Used to calculate entry start cursor
            let entry_block_off = cursor.pos;
            // Section where extended (variable-length) information is stored
            let mut entry_ext = RawCursor {
                inner: cursor.inner,
                pos: cursor.pos + (entry_len as usize * entry_count as usize),
            };

            for entry_num in 0..entry_count {
                let mut entry = ScriptEntry {
                    data: Vec::with_capacity(entry_len as usize),
                    ext_data: vec![],
                };

                let entry_start_off = entry_block_off + (entry_len as usize * entry_num as usize);
                cursor.pos = entry_start_off;

                let name = cursor.read_padded_string(0x10);
                section
                    .lookup_map
                    .insert(name.to_ascii_lowercase(), entry_num as usize);

                for desc in &section.descriptors {
                    // (offset, size). Offset being the offset of the length storage within the
                    // containing section
                    let size = match desc.kind {
                        0xc => (0, 0x14),
                        0xd => (0, 0x4),
                        0xe => (0, 0xc),
                        0xf => (4, 0x20),
                        0x10 => (4, 0x10),
                        0x17 => (0, 0x28),
                        0x19 => (0, 0x98),

                        _ => (0, 0),
                    };

                    if (size.1 == 0) {
                        continue; // No entry_ext storage
                    }

                    cursor.pos = entry_start_off + desc.offset as usize + size.0 as usize;
                    let len = cursor.read_u16();
                    entry
                        .ext_data
                        .extend(entry_ext.read_bytes(len as usize * size.1));
                }
                cursor.pos = entry_start_off;
                entry.data = Vec::from(cursor.read_bytes(entry_len as usize));
                section.entries.push(entry);
            }

            // Setup new cursor pos
            cursor.pos = entry_ext.pos;
            script.sections[section_id as usize] = Some(section);
        }

        script
    }

    #[wasm_bindgen(unchecked_return_type = "Redline.ScriptDescriptor | undefined")]
    pub fn lookup_descriptor(&self, section: usize) -> JsValue {
        if let Some(section) = &self.sections[section] {
            return serde_wasm_bindgen::to_value(&section.descriptors).unwrap();
        }
        JsValue::undefined()
    }

    #[wasm_bindgen(unchecked_return_type = "Redline.ScriptObject | undefined")]
    pub fn lookup_object(&self, name: &str) -> JsValue {
        if let Some(section) = &self.sections[ScriptKind::Objects as usize] {
            if let Some(idx) = section.lookup_map.get(name) {
                let script = Object::from_bytes((&section.entries[*idx].data, 0))
                    .unwrap()
                    .1;
                return serde_wasm_bindgen::to_value(&script).unwrap();
            }
        }
        JsValue::undefined()
    }

    #[wasm_bindgen(unchecked_return_type = "Redline.ScriptItem | undefined")]
    pub fn lookup_item(&self, name: &str) -> JsValue {
        if let Some(section) = &self.sections[ScriptKind::Item as usize] {
            if let Some(idx) = section.lookup_map.get(name) {
                let script = Item::from_reader_with_ctx(
                    &mut Reader::new(&mut Cursor::new(&section.entries[*idx].data)),
                    self.version,
                )
                .unwrap();
                return serde_wasm_bindgen::to_value(&script).unwrap();
            }
        }
        JsValue::undefined()
    }

    #[wasm_bindgen(unchecked_return_type = "Redline.ScriptAnimDesc | undefined")]
    pub fn lookup_animdesc(&self, name: &str) -> JsValue {
        if let Some(section) = &self.sections[ScriptKind::AnimDesc as usize] {
            if let Some(idx) = section.lookup_map.get(name) {
                let script = AnimDesc::from_bytes((&section.entries[*idx].data, 0))
                    .unwrap()
                    .1;
                return serde_wasm_bindgen::to_value(&script).unwrap();
            }
        }
        JsValue::undefined()
    }

    #[wasm_bindgen(unchecked_return_type = "Redline.ScriptSky | undefined")]
    pub fn lookup_sky(&self, name: &str) -> JsValue {
        if let Some(section) = &self.sections[ScriptKind::Sky as usize] {
            if let Some(idx) = section.lookup_map.get(name) {
                let script = Sky::from_bytes((&section.entries[*idx].data, 0)).unwrap().1;
                return serde_wasm_bindgen::to_value(&script).unwrap();
            }
        }
        JsValue::undefined()
    }

    #[wasm_bindgen(unchecked_return_type = "Redline.ScriptSprite | undefined")]
    pub fn lookup_sprite(&self, name: &str) -> JsValue {
        if let Some(section) = &self.sections[ScriptKind::Particles as usize] {
            if let Some(idx) = section.lookup_map.get(name) {
                let script = Sprite::from_bytes((&section.entries[*idx].data, 0))
                    .unwrap()
                    .1;
                return serde_wasm_bindgen::to_value(&script).unwrap();
            }
        }
        JsValue::undefined()
    }

    #[wasm_bindgen(unchecked_return_type = "Redline.ScriptEmitterArray | undefined")]
    pub fn lookup_emitter_array(&self, name: &str) -> JsValue {
        if let Some(section) = &self.sections[ScriptKind::EmitterArray as usize] {
            if let Some(idx) = section.lookup_map.get(name) {
                let mut script = EmitterArray::from_bytes((&section.entries[*idx].data, 0))
                    .unwrap()
                    .1;

                let mut off = script.scripts.populate(&section.entries[*idx].ext_data);
                return serde_wasm_bindgen::to_value(&script).unwrap();
            }
        }
        JsValue::undefined()
    }

    #[wasm_bindgen(unchecked_return_type = "Redline.ScriptEmitter | undefined")]
    pub fn lookup_emitter(&self, name: &str) -> JsValue {
        if let Some(section) = &self.sections[ScriptKind::Emitter as usize] {
            if let Some(idx) = section.lookup_map.get(name) {
                let mut script = Emitter::from_bytes((&section.entries[*idx].data, 0))
                    .unwrap()
                    .1;

                let mut off = script.unk1.populate(&section.entries[*idx].ext_data);
                off += script.unk2.populate(&section.entries[*idx].ext_data[off..]);
                off += script.unk3.populate(&section.entries[*idx].ext_data[off..]);

                return serde_wasm_bindgen::to_value(&script).unwrap();
            }
        }
        JsValue::undefined()
    }

    #[wasm_bindgen(unchecked_return_type = "Redline.ScriptSubEmitter | undefined")]
    pub fn lookup_subemitter(&self, name: &str) -> JsValue {
        if let Some(section) = &self.sections[ScriptKind::SubEmitter as usize] {
            if let Some(idx) = section.lookup_map.get(name) {
                let mut script = SubEmitter::from_bytes((&section.entries[*idx].data, 0))
                    .unwrap()
                    .1;

                let mut off = script.unk1.populate(&section.entries[*idx].ext_data);
                off += script.unk2.populate(&section.entries[*idx].ext_data[off..]);
                return serde_wasm_bindgen::to_value(&script).unwrap();
            }
        }
        JsValue::undefined()
    }
}
