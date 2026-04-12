use deku::{ctx::Order, DekuError, DekuReader};

mod world;

// Read length-prefixed string
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
