use deku::{DekuContainerRead, DekuRead};
use wasm_bindgen::prelude::*;

use crate::redline::read_len_string_vec;

#[derive(DekuRead)]
#[wasm_bindgen(js_name = "RedlineSeqAnim", getter_with_clone)]
#[allow(unused)]
struct SequentialAnim {
    version: u32,
    frame_count: u32,
    pub framerate: u32,
    #[deku(reader = "read_len_string_vec(deku::reader, *frame_count as usize)")]
    pub frames: Vec<String>,
}

#[wasm_bindgen(js_class = "RedlineSeqAnim")]
#[allow(unused)]
impl SequentialAnim {
    pub fn load(raw: &[u8]) -> Option<SequentialAnim> {
        if raw.len() < 4 || raw[0..4] != [0, 0, 0, 0] {
            return None;
        }

        let anim = SequentialAnim::from_bytes((raw, 0)).map_or_else(|_| None, |x| Some(x.1));
        anim
    }
}
