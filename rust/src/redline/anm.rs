use deku::{DekuContainerRead, DekuRead};
use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::redline::read_len_string_vec;

#[derive(Serialize, ts_rs::TS, DekuRead)]
#[allow(unused)]
#[ts(export, export_to = "redline.ts", rename = "SeqAnim")]
struct SequentialAnim {
    #[serde(skip)]
    pub version: u32,
    #[serde(skip)]
    pub frame_count: u32,
    pub framerate: u16,
    pub unk: u16,
    #[deku(reader = "read_len_string_vec(deku::reader, *frame_count as usize)")]
    pub frames: Vec<String>,
}

//#[wasm_bindgen(typescript_custom_section)]
//const TS_SequentialAnim: &'static str = r#"
//export type RedlineSeqAnim = {
//    //static load(raw: Uint8Array): RedlineSeqAnim | undefined;
//    framerate: number,
//    frames: string[],
//}"#;

#[allow(unused)]
#[wasm_bindgen(unchecked_return_type = "Redline.SeqAnim")]
pub fn redline_load_seq_anim(raw: &[u8]) -> JsValue {
    if raw.len() < 4 || raw[0..4] != [0, 0, 0, 0] {
        return JsValue::undefined();
    }

    let anim = SequentialAnim::from_bytes((raw, 0)).map_or_else(|_| None, |x| Some(x.1));
    serde_wasm_bindgen::to_value(&anim).unwrap()
}
