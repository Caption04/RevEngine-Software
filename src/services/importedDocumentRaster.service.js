'use strict';

const zlib = require('node:zlib');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngRgb(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  let palette = null;
  let transparency = null;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || interlace !== 0 || !idat.length) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) return null;
  const rowBytes = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < (rowBytes + 1) * height) return null;
  const rows = [];
  let inputOffset = 0;
  let previous = Buffer.alloc(rowBytes);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset++];
    const source = raw.subarray(inputOffset, inputOffset + rowBytes);
    inputOffset += rowBytes;
    const row = Buffer.alloc(rowBytes);
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] || 0;
      const upperLeft = x >= channels ? previous[x - channels] || 0 : 0;
      let value = source[x];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (value + paethPredictor(left, up, upperLeft)) & 255;
      else if (filter !== 0) return null;
      row[x] = value;
    }
    rows.push(row);
    previous = row;
  }
  const rgb = Buffer.alloc(width * height * 3);
  let rgbOffset = 0;
  for (const row of rows) {
    for (let x = 0; x < width; x += 1) {
      const index = x * channels;
      let r;
      let g;
      let b;
      let alpha = 255;
      if (colorType === 0) r = g = b = row[index];
      else if (colorType === 2) [r, g, b] = [row[index], row[index + 1], row[index + 2]];
      else if (colorType === 3) {
        const paletteIndex = row[index];
        if (!palette || paletteIndex * 3 + 2 >= palette.length) return null;
        r = palette[paletteIndex * 3];
        g = palette[paletteIndex * 3 + 1];
        b = palette[paletteIndex * 3 + 2];
        if (transparency && paletteIndex < transparency.length) alpha = transparency[paletteIndex];
      } else if (colorType === 4) {
        r = g = b = row[index];
        alpha = row[index + 1];
      } else if (colorType === 6) {
        [r, g, b, alpha] = [row[index], row[index + 1], row[index + 2], row[index + 3]];
      }
      if (alpha !== 255) {
        const ratio = alpha / 255;
        r = Math.round((r * ratio) + (255 * (1 - ratio)));
        g = Math.round((g * ratio) + (255 * (1 - ratio)));
        b = Math.round((b * ratio) + (255 * (1 - ratio)));
      }
      rgb[rgbOffset++] = r;
      rgb[rgbOffset++] = g;
      rgb[rgbOffset++] = b;
    }
  }
  return { width, height, rgb };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, checksum]);
}

function encodeRgbPng(width, height, rgb) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new TypeError('PNG dimensions are invalid.');
  if (!Buffer.isBuffer(rgb) || rgb.length !== width * height * 3) throw new TypeError('PNG RGB data is invalid.');
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const target = y * (width * 3 + 1);
    rows[target] = 0;
    rgb.copy(rows, target + 1, y * width * 3, (y + 1) * width * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(rows)),
    pngChunk('IEND')
  ]);
}

function hexRgb(value, fallback) {
  const input = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
  return [
    Number.parseInt(input.slice(1, 3), 16),
    Number.parseInt(input.slice(3, 5), 16),
    Number.parseInt(input.slice(5, 7), 16)
  ];
}

function distance(left, right) {
  const r = left[0] - right[0];
  const g = left[1] - right[1];
  const b = left[2] - right[2];
  return Math.sqrt((r * r) + (g * g) + (b * b));
}


function stableLineSegments(source, imageWidth, left, top, right, bottom, background) {
  const segments = [];
  const regionWidth = Math.max(0, right - left);
  const regionHeight = Math.max(0, bottom - top);
  const pixelAt = (x, y) => {
    const offset = (y * imageWidth + x) * 3;
    return [source[offset], source[offset + 1], source[offset + 2]];
  };
  const finishHorizontal = (y, start, end) => {
    if (end - start >= Math.max(8, regionWidth * 0.68)) segments.push({ horizontal: true, fixed: y, start, end });
  };
  for (let y = top; y < bottom; y += 1) {
    let runStart = -1;
    let runColor = null;
    for (let x = left; x <= right; x += 1) {
      const pixel = x < right ? pixelAt(x, y) : null;
      const continues = pixel && distance(pixel, background) >= 4 && (!runColor || distance(pixel, runColor) <= 12);
      if (continues) {
        if (runStart < 0) {
          runStart = x;
          runColor = pixel;
        }
        continue;
      }
      if (runStart >= 0) finishHorizontal(y, runStart, x);
      runStart = pixel && distance(pixel, background) >= 4 ? x : -1;
      runColor = runStart >= 0 ? pixel : null;
    }
  }
  const finishVertical = (x, start, end) => {
    const nearEdge = x - left <= regionWidth * 0.18 || right - x <= regionWidth * 0.18;
    if (nearEdge && end - start >= Math.max(8, regionHeight * 0.82)) segments.push({ horizontal: false, fixed: x, start, end });
  };
  for (let x = left; x < right; x += 1) {
    let runStart = -1;
    let runColor = null;
    for (let y = top; y <= bottom; y += 1) {
      const pixel = y < bottom ? pixelAt(x, y) : null;
      const continues = pixel && distance(pixel, background) >= 4 && (!runColor || distance(pixel, runColor) <= 12);
      if (continues) {
        if (runStart < 0) {
          runStart = y;
          runColor = pixel;
        }
        continue;
      }
      if (runStart >= 0) finishVertical(x, runStart, y);
      runStart = pixel && distance(pixel, background) >= 4 ? y : -1;
      runColor = runStart >= 0 ? pixel : null;
    }
  }
  return segments;
}

function cleanImportedPageAsset(buffer, page) {
  const decoded = decodePngRgb(buffer);
  const elements = page && Array.isArray(page.textElements) ? page.textElements : [];
  const pageWidth = Number(page && page.width || 0);
  const pageHeight = Number(page && page.height || 0);
  if (!decoded || !elements.length || pageWidth <= 0 || pageHeight <= 0) return buffer;
  const rgb = Buffer.from(decoded.rgb);
  const scaleX = decoded.width / pageWidth;
  const scaleY = decoded.height / pageHeight;
  for (const element of elements) {
    const width = Number(element && element.width || 0);
    const height = Number(element && element.height || 0);
    if (width <= 0 || height <= 0) continue;
    const background = hexRgb(element.backgroundColor, '#FFFFFF');
    const edgePadding = 0.6;
    const left = Math.max(0, Math.floor((Number(element.x || 0) - edgePadding) * scaleX));
    const top = Math.max(0, Math.floor((Number(element.y || 0) - edgePadding) * scaleY));
    const right = Math.min(decoded.width, Math.ceil((Number(element.x || 0) + width + edgePadding) * scaleX));
    const bottom = Math.min(decoded.height, Math.ceil((Number(element.y || 0) + height + edgePadding) * scaleY));
    const preserved = stableLineSegments(decoded.rgb, decoded.width, left, top, right, bottom, background);
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * decoded.width + x) * 3;
        rgb[offset] = background[0];
        rgb[offset + 1] = background[1];
        rgb[offset + 2] = background[2];
      }
    }
    for (const segment of preserved) {
      if (segment.horizontal) {
        for (let x = segment.start; x < segment.end; x += 1) {
          const offset = (segment.fixed * decoded.width + x) * 3;
          rgb[offset] = decoded.rgb[offset];
          rgb[offset + 1] = decoded.rgb[offset + 1];
          rgb[offset + 2] = decoded.rgb[offset + 2];
        }
      } else {
        for (let y = segment.start; y < segment.end; y += 1) {
          const offset = (y * decoded.width + segment.fixed) * 3;
          rgb[offset] = decoded.rgb[offset];
          rgb[offset + 1] = decoded.rgb[offset + 1];
          rgb[offset + 2] = decoded.rgb[offset + 2];
        }
      }
    }
  }
  return encodeRgbPng(decoded.width, decoded.height, rgb);
}

module.exports = {
  cleanImportedPageAsset,
  decodePngRgb,
  encodeRgbPng
};
