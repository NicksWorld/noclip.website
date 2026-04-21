use deku::{ctx::Order, DekuContainerRead, DekuRead};
use std::{collections::HashMap, convert::TryInto};
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
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
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

#[derive(Debug, Clone)]
struct Descriptor {
    kind: u16,
    offset: u16,
    named: u16, // 1 or 0
    name: String,
}

#[non_exhaustive]
enum ScriptType {
    Car = 0x0,
    Sky = 0x1,
    AI = 0x3,     // Foot or Car
    Weapon = 0x6, // Unverified
    Person = 0x7,
    Projectile = 0x8, // Unverified - very uncertain
    Object = 0x9,
    AnimDesc = 0xC, // Unverified
    SFX = 0xE,
    Sprite = 0xF,
    CarCollision = 0x14, // Unverified - Car collision spin/elasticity
    Item = 0x17,
    CameraShake = 0x26,

    // Default for unknown script types. Valid are 0x00-0x26
    Unknown = 0xFF,
}

// Handler method pointers are stored at 0x5CC794 + (id * 8).
// Not every type has one, but those that do typically load or lookup a asset or script
#[non_exhaustive]
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
    ArraySomething = 0xC,
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

#[derive(Debug, Clone)]
#[allow(unused)]
#[wasm_bindgen(js_name = "RedlineScriptRef", getter_with_clone, inspectable)]
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

#[derive(Debug, DekuRead)]
#[allow(unused)]
#[wasm_bindgen(js_name = "RedlineScriptSky", getter_with_clone, inspectable)]
struct Sky {
    #[deku(reader = "read_padded_string(deku::reader, 18)")]
    pub name: String,
    #[deku(reader = "read_padded_string(deku::reader, 36)")]
    pub sky: String,
}

#[derive(Debug, DekuRead)]
#[allow(unused)]
#[wasm_bindgen(js_name = "RedlineScriptAnimDesc", getter_with_clone, inspectable)]
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

#[derive(Debug, DekuRead)]
#[allow(unused)]
#[wasm_bindgen(js_name = "RedlineScriptObject", getter_with_clone, inspectable)]
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
    pub unk9: ScriptRef,
    pub visible_range: f32,
    pub emitter_rnd_release: i16,
}

#[allow(unused)]
#[wasm_bindgen(js_class = "RedlineScript")]
impl PCScript {
    pub fn load(raw: &[u8]) -> PCScript {
        let mut script = PCScript {
            sections: [const { None }; 0x28],
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

            if (section_id == 17) {
                log(&format!("DESC: {:#?}", section.descriptors));
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

    pub fn lookup_object(&self, name: &str) -> Option<Object> {
        if let Some(section) = &self.sections[ScriptType::Object as usize] {
            if let Some(idx) = section.lookup_map.get(name) {
                let script = Object::from_bytes((&section.entries[*idx].data, 0))
                    .unwrap()
                    .1;
                return Some(script);
            }
        }
        None
    }

    pub fn lookup_animdesc(&self, name: &str) -> Option<AnimDesc> {
        //for i in 0..0x26 {
        //if let Some(v) = &self.sections[i] {
        //log(&format!("{} - {:#?}", i, v.lookup_map));
        //}
        //}

        if let Some(section) = &self.sections[ScriptType::AnimDesc as usize] {
            if let Some(idx) = section.lookup_map.get(name) {
                let script = AnimDesc::from_bytes((&section.entries[*idx].data, 0))
                    .unwrap()
                    .1;
                return Some(script);
            }
        }
        None
    }

    pub fn lookup_sky(&self, name: &str) -> Option<Sky> {
        if let Some(section) = &self.sections[ScriptType::Sky as usize] {
            if let Some(idx) = section.lookup_map.get(name) {
                let script = Sky::from_bytes((&section.entries[*idx].data, 0)).unwrap().1;
                return Some(script);
            }
        }
        None
    }
}
