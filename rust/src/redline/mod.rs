use deku::{ctx::Order, DekuError, DekuReader};
use wasm_bindgen::prelude::*;

mod anm;
mod geo;
mod pcscript;
mod world;

// Setup typescript re-exports from ts-rs generated types
#[wasm_bindgen(typescript_custom_section)]
const TS_APPEND: &'static str = "export * as Redline from './redline';";

// Shared parsing logic used across file formats

/// Read null-terminated padded string
fn read_padded_string<R: std::io::Read + std::io::Seek>(
    reader: &mut deku::reader::Reader<R>,
    len: usize,
) -> Result<String, DekuError> {
    let mut raw = vec![0u8; len];
    reader.read_bytes(len, &mut raw, Order::Msb0)?;

    Ok(
        String::from_utf8_lossy(&raw.into_iter().take_while(|v| *v != 0).collect::<Vec<u8>>())
            .to_string(),
    )
}

/// Read length-prefixed string
fn read_len_string<R: std::io::Read + std::io::Seek>(
    reader: &mut deku::reader::Reader<R>,
) -> Result<String, DekuError> {
    let len = u8::from_reader_with_ctx(reader, ())?;
    if len != 0 {
        let mut raw = vec![0u8; len as usize];
        reader.read_bytes(len as usize, &mut raw, Order::Msb0)?;
        Ok(String::from_utf8_lossy(&raw).to_string())
    } else {
        Ok(String::new())
    }
}

fn read_len_string_opt<R: std::io::Read + std::io::Seek>(
    reader: &mut deku::reader::Reader<R>,
) -> Result<Option<String>, DekuError> {
    Ok(Some(read_len_string(reader)?))
}

// Read a vec of above
fn read_len_string_vec<R: std::io::Read + std::io::Seek, N: Into<usize>>(
    reader: &mut deku::reader::Reader<R>,
    len: N,
) -> Result<Vec<String>, DekuError> {
    let mut v = vec![];
    for _ in 0..len.into() {
        v.push(read_len_string(reader)?);
    }
    Ok(v)
}
