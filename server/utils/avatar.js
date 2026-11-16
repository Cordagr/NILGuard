const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const LEGACY_PIXEL_AVATARS = new Set(['pixel-soccer', 'pixel-field', 'pixel-profile']);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_IEND_CHUNK = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const JPEG_START_OF_FRAME = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

function getJpegDimensions(buffer) {
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      return null;
    }

    while (buffer[offset] === 0xff) {
      offset += 1;
    }
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > buffer.length) {
      return null;
    }

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      return null;
    }
    if (JPEG_START_OF_FRAME.has(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5)
      };
    }

    offset += segmentLength;
  }

  return null;
}

export function validateAvatar(value) {
  if (value === null || value === undefined || value === '' || LEGACY_PIXEL_AVATARS.has(value)) {
    return null;
  }

  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(value));
  if (!match) {
    throw new Error('Choose a PNG or JPG image.');
  }

  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_AVATAR_BYTES) {
    throw new Error('Profile photos must be 2 MB or smaller.');
  }

  let dimensions;
  if (match[1] === 'png') {
    const isPng = bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE);
    const isComplete = isPng && bytes.subarray(-PNG_IEND_CHUNK.length).equals(PNG_IEND_CHUNK);
    dimensions = isComplete
      ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
      : null;
  } else {
    const isJpeg = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
    const isComplete = isJpeg && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
    dimensions = isComplete ? getJpegDimensions(bytes) : null;
  }

  if (!dimensions || dimensions.width < 1 || dimensions.width !== dimensions.height) {
    throw new Error('Profile photos must be valid square PNG or JPG images.');
  }

  return value;
}
