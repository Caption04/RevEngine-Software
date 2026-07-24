'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePdfXml } = require('../src/services/importedDocumentCanvas.service');
const { cleanImportedPageAsset, decodePngRgb, encodeRgbPng } = require('../src/services/importedDocumentRaster.service');
const { normalizeImportedCanvas } = require('../src/services/documentTemplate.service');

test('PDF XML extraction retains the nearest available font family, size, colour, weight, and style', () => {
  const pages = parsePdfXml(`<?xml version="1.0"?>
    <pdf2xml>
      <fontspec id="0" size="9" family="Helvetica" color="#233f60"/>
      <page number="1" top="0" left="0" width="612" height="792">
        <text top="214" left="205" width="61" height="8" font="0"><i><b>Student Name</b></i></text>
      </page>
    </pdf2xml>`);

  assert.equal(pages.length, 1);
  assert.equal(pages[0].lines.length, 1);
  assert.deepEqual(pages[0].lines[0], {
    text: 'Student Name',
    x: 205,
    y: 214,
    width: 61,
    height: 8,
    fontSize: 9,
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    bold: true,
    italic: true,
    lineHeight: 0.8888888888888888,
    textColor: '#233F60'
  });
});

test('imported canvas normalization keeps italic and line-height metadata', () => {
  const canvas = normalizeImportedCanvas({
    mode: 'EXACT_PDF',
    pages: [{
      pageNumber: 1,
      width: 80,
      height: 30,
      backgroundAsset: 'page.png',
      textElements: [{
        originalText: 'Text',
        text: 'Text',
        x: 10,
        y: 8,
        width: 20,
        height: 9,
        fontSize: 9,
        fontFamily: '"Times New Roman", Times, serif',
        italic: true,
        lineHeight: 0.92
      }]
    }]
  });

  assert.equal(canvas.pages[0].textElements[0].italic, true);
  assert.equal(canvas.pages[0].textElements[0].lineHeight, 0.92);
});

test('clean page raster removes original glyphs while preserving table borders', () => {
  const width = 80;
  const height = 30;
  const rgb = Buffer.alloc(width * height * 3, 255);
  const setPixel = (x, y, colour) => {
    const offset = (y * width + x) * 3;
    rgb[offset] = colour[0];
    rgb[offset + 1] = colour[1];
    rgb[offset + 2] = colour[2];
  };
  for (let x = 0; x < width; x += 1) setPixel(x, 17, [180, 205, 235]);
  for (let y = 9; y <= 14; y += 1) {
    for (let x = 11; x <= 18; x += 1) setPixel(x, y, [0, 0, 0]);
  }
  const source = encodeRgbPng(width, height, rgb);
  const cleaned = cleanImportedPageAsset(source, {
    width,
    height,
    textElements: [{ x: 10, y: 8, width: 10, height: 9, textColor: '#000000', backgroundColor: '#FFFFFF' }]
  });
  const decoded = decodePngRgb(cleaned);
  const pixel = (x, y) => {
    const offset = (y * width + x) * 3;
    return Array.from(decoded.rgb.subarray(offset, offset + 3));
  };

  assert.deepEqual(pixel(14, 11), [255, 255, 255]);
  assert.deepEqual(pixel(14, 17), [180, 205, 235]);
});
