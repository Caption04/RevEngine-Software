'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { decodePng } = require('./businessDocumentPdf.service');
const { starterDesign, normalizeDesign } = require('./documentTemplate.service');

const MAX_PAGES = 20;
const MAX_TEXT_ELEMENTS = 900;

function clean(value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
}

function xmlDecode(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function numericAttribute(tag, name, fallback = 0) {
  const match = String(tag || '').match(new RegExp(`${name}="([^"]+)"`, 'i'));
  const value = match ? Number(match[1]) : fallback;
  return Number.isFinite(value) ? value : fallback;
}

function parseBboxLayout(xml) {
  const pages = [];
  const pagePattern = /<page\b([^>]*)>([\s\S]*?)<\/page>/gi;
  let pageMatch;
  while ((pageMatch = pagePattern.exec(String(xml || ''))) && pages.length < MAX_PAGES) {
    const pageTag = pageMatch[1];
    const pageBody = pageMatch[2];
    const width = numericAttribute(pageTag, 'width', 595);
    const height = numericAttribute(pageTag, 'height', 842);
    const lines = [];
    const linePattern = /<line\b([^>]*)>([\s\S]*?)<\/line>/gi;
    let lineMatch;
    while ((lineMatch = linePattern.exec(pageBody))) {
      const lineTag = lineMatch[1];
      const words = [];
      const wordPattern = /<word\b[^>]*>([\s\S]*?)<\/word>/gi;
      let wordMatch;
      while ((wordMatch = wordPattern.exec(lineMatch[2]))) {
        const value = clean(xmlDecode(wordMatch[1].replace(/<[^>]+>/g, '')));
        if (value) words.push(value);
      }
      const text = clean(words.join(' '));
      if (!text) continue;
      const xMin = numericAttribute(lineTag, 'xMin');
      const yMin = numericAttribute(lineTag, 'yMin');
      const xMax = numericAttribute(lineTag, 'xMax', xMin + 1);
      const yMax = numericAttribute(lineTag, 'yMax', yMin + 1);
      if (![xMin, yMin, xMax, yMax].every(Number.isFinite) || xMax <= xMin || yMax <= yMin) continue;
      lines.push({ text, x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin });
    }
    pages.push({ pageNumber: pages.length + 1, width, height, lines });
  }
  return pages;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding,
    input: options.input,
    maxBuffer: options.maxBuffer || 24 * 1024 * 1024,
    timeout: options.timeout || 30000,
    windowsHide: true
  });
  if (result.error && result.error.code === 'ENOENT') {
    throw new Error(`Document import needs ${command}. Install poppler-utils on the server before importing PDFs.`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(clean(result.stderr) || `${command} could not process this document.`);
  return result;
}

function quantize(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value || 0) / 16) * 16));
}

function rgbHex(rgb, fallback = '#FFFFFF') {
  if (!Array.isArray(rgb) || rgb.length < 3) return fallback;
  return `#${rgb.slice(0, 3).map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function pixelAt(raw, image, x, y) {
  const px = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const offset = (py * image.width + px) * 3;
  return [raw[offset], raw[offset + 1], raw[offset + 2]];
}

function colorDistance(left, right) {
  return Math.sqrt(left.reduce((sum, value, index) => sum + Math.pow(value - right[index], 2), 0));
}

function prepareRaster(buffer) {
  try {
    const decoded = decodePng(buffer);
    if (!decoded || !decoded.data) return null;
    return { ...decoded, raw: require('node:zlib').inflateSync(decoded.data) };
  } catch {
    return null;
  }
}

function sampleElementColors(raster, page, box) {
  if (!raster || !raster.raw) return { backgroundColor: '#FFFFFF', textColor: '#111827' };
  const decoded = raster;
  const raw = raster.raw;
  const scaleX = decoded.width / page.width;
  const scaleY = decoded.height / page.height;
  const left = box.x * scaleX;
  const top = box.y * scaleY;
  const right = (box.x + box.width) * scaleX;
  const bottom = (box.y + box.height) * scaleY;
  const outside = [
    [left - 3, top - 3], [right + 3, top - 3], [left - 3, bottom + 3], [right + 3, bottom + 3],
    [left - 4, (top + bottom) / 2], [right + 4, (top + bottom) / 2]
  ].map(([x, y]) => pixelAt(raw, decoded, x, y));
  const buckets = new Map();
  outside.forEach((rgb) => {
    const key = rgb.map(quantize).join(',');
    const entry = buckets.get(key) || { count: 0, rgb };
    entry.count += 1;
    buckets.set(key, entry);
  });
  const background = Array.from(buckets.values()).sort((a, b) => b.count - a.count)[0]?.rgb || [255, 255, 255];
  const inside = [];
  const stepsX = Math.max(3, Math.min(18, Math.round((right - left) / 5)));
  const stepsY = Math.max(2, Math.min(8, Math.round((bottom - top) / 3)));
  for (let ix = 0; ix <= stepsX; ix += 1) {
    for (let iy = 0; iy <= stepsY; iy += 1) {
      inside.push(pixelAt(raw, decoded, left + ((right - left) * ix / Math.max(1, stepsX)), top + ((bottom - top) * iy / Math.max(1, stepsY))));
    }
  }
  const contrasting = inside.filter((rgb) => colorDistance(rgb, background) > 70);
  const textColor = contrasting.length
    ? contrasting.sort((a, b) => colorDistance(b, background) - colorDistance(a, background))[Math.floor(contrasting.length * 0.2)]
    : [17, 24, 39];
  return { backgroundColor: rgbHex(background), textColor: rgbHex(textColor, '#111827') };
}

function suggestedBinding(text) {
  const value = clean(text);
  const tests = [
    ['DOCUMENT_NUMBER', /^(?:invoice|quote|contract|statement|reference|student)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9/-]+$/i],
    ['DOCUMENT_ISSUE_DATE', /^(?:issued|issue date|creation date|statement date)\s*:/i],
    ['DOCUMENT_DUE_DATE', /^(?:due|due date|valid until|bill from)\s*:/i],
    ['CUSTOMER_NAME', /^(?:student name|customer name|client name|bill to)\b/i],
    ['COMPANY_EMAIL', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ['COMPANY_PHONE', /(?:tel|phone|mobile)\s*:/i],
    ['COMPANY_TAX', /(?:vat|tax)\s*(?:number|no\.)\s*:/i],
    ['TOTAL_TOTAL', /^(?:total due|grand total|balance due|total)\b/i],
    ['DOCUMENT_PO', /(?:customer po|purchase order|po number)\s*:/i]
  ];
  const match = tests.find(([, pattern]) => pattern.test(value));
  return match ? match[0] : 'STATIC';
}

function inferBold(text, height) {
  const value = clean(text);
  return height >= 13 || (/^[A-Z0-9 /&-]{4,}$/.test(value) && /[A-Z]/.test(value)) || /^(?:summary|payment options?|fee statement|invoice|quote|contract)$/i.test(value);
}

function parseSvgLogo(svg, page, raster) {
  const sources = new Map();
  const imagePattern = /<image\b([^>]*)\bid="([^"]+)"([^>]*)>/gi;
  let imageMatch;
  while ((imageMatch = imagePattern.exec(String(svg || '')))) {
    const attrs = `${imageMatch[1]} ${imageMatch[3]}`;
    sources.set(imageMatch[2], { width: numericAttribute(attrs, 'width'), height: numericAttribute(attrs, 'height') });
  }
  const candidates = [];
  const usePattern = /<use\b[^>]*xlink:href="#([^"]+)"[^>]*transform="matrix\(([^)]+)\)"[^>]*>/gi;
  let useMatch;
  while ((useMatch = usePattern.exec(String(svg || '')))) {
    const source = sources.get(useMatch[1]);
    if (!source) continue;
    const matrix = useMatch[2].split(/[ ,]+/).map(Number);
    if (matrix.length !== 6 || matrix.some((value) => !Number.isFinite(value))) continue;
    const [a, b, c, d, e, f] = matrix;
    if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) continue;
    const width = Math.abs(source.width * a);
    const height = Math.abs(source.height * d);
    const x = e;
    const y = f;
    if (width < 24 || height < 14 || y > page.height * 0.38 || width > page.width * 0.75 || height > page.height * 0.3) continue;
    candidates.push({ page: page.pageNumber, x, y, width, height, area: width * height });
  }
  const logo = candidates.sort((left, right) => right.area - left.area)[0];
  if (!logo) return null;
  const padding = Math.max(3, Math.min(10, Math.min(logo.width, logo.height) * 0.06));
  const padded = {
    ...logo,
    x: Math.max(0, logo.x - padding),
    y: Math.max(0, logo.y - padding),
    width: Math.min(page.width - Math.max(0, logo.x - padding), logo.width + (padding * 2)),
    height: Math.min(page.height - Math.max(0, logo.y - padding), logo.height + (padding * 2))
  };
  const colors = sampleElementColors(raster, page, padded);
  return { ...padded, mode: 'ORIGINAL', backgroundColor: colors.backgroundColor };
}

function exactCanvasDesign({ buffer, documentType, fileName, assetKey }) {
  const stableAssetKey = clean(assetKey).replace(/[^a-zA-Z0-9_-]/g, '') || `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revengine-import-'));
  const inputPath = path.join(tempDir, 'source.pdf');
  fs.writeFileSync(inputPath, buffer);
  try {
    const bbox = run('pdftotext', ['-bbox-layout', inputPath, '-'], { encoding: 'utf8', timeout: 20000 });
    const pages = parseBboxLayout(bbox.stdout);
    if (!pages.length) throw new Error('The PDF did not contain readable pages.');
    const outputPrefix = path.join(tempDir, 'page');
    run('pdftoppm', ['-png', '-r', '144', '-f', '1', '-l', String(Math.min(MAX_PAGES, pages.length)), inputPath, outputPrefix], { timeout: 60000 });
    const assets = [];
    let totalElements = 0;
    const logos = [];
    const canvasPages = [];
    for (const page of pages.slice(0, MAX_PAGES)) {
      const generated = path.join(tempDir, `page-${page.pageNumber}.png`);
      if (!fs.existsSync(generated)) continue;
      const pageBuffer = fs.readFileSync(generated);
      const raster = prepareRaster(pageBuffer);
      const backgroundAsset = `${stableAssetKey}-page-${page.pageNumber}.png`;
      assets.push({ fileName: backgroundAsset, buffer: pageBuffer });
      const textElements = [];
      for (const line of page.lines) {
        if (totalElements >= MAX_TEXT_ELEMENTS) break;
        const colors = sampleElementColors(raster, page, line);
        const fontSize = Math.max(5.5, Math.min(30, line.height * 0.78));
        textElements.push({
          id: `imported-text-${page.pageNumber}-${textElements.length + 1}`,
          page: page.pageNumber,
          x: line.x,
          y: line.y,
          width: line.width,
          height: line.height,
          originalText: line.text,
          text: line.text,
          binding: 'STATIC',
          suggestedBinding: suggestedBinding(line.text),
          fontSize,
          fontFamily: 'Arial, Helvetica, sans-serif',
          bold: inferBold(line.text, line.height),
          align: line.x + line.width > page.width * 0.86 ? 'RIGHT' : 'LEFT',
          textColor: colors.textColor,
          backgroundColor: colors.backgroundColor,
          hidden: false
        });
        totalElements += 1;
      }
      const svgPath = path.join(tempDir, `logo-page-${page.pageNumber}.svg`);
      try {
        run('pdftocairo', ['-f', String(page.pageNumber), '-l', String(page.pageNumber), '-svg', inputPath, svgPath], { timeout: 30000 });
        const exactPath = fs.existsSync(svgPath) ? svgPath : null;
        const generatedPath = exactPath || fs.readdirSync(tempDir)
          .map((name) => path.join(tempDir, name))
          .find((candidate) => candidate.startsWith(svgPath.replace(/\.svg$/i, '')) && /\.svg$/i.test(candidate));
        if (generatedPath) {
          const detectedLogo = parseSvgLogo(fs.readFileSync(generatedPath, 'utf8'), page, raster);
          if (detectedLogo) logos.push({ ...detectedLogo, id: `imported-logo-${page.pageNumber}-1` });
        }
      } catch {
        // Logo detection is best-effort. The page remains editable when no logo is found.
      }
      canvasPages.push({ pageNumber: page.pageNumber, width: page.width, height: page.height, backgroundAsset, textElements });
    }
    if (!canvasPages.length) throw new Error('The PDF pages could not be rendered.');
    if (logos.length === 1 && canvasPages.length > 1) {
      const base = logos[0];
      canvasPages.forEach((page, index) => {
        if (Number(page.pageNumber) === Number(base.page)) return;
        logos.push({ ...base, id: `imported-logo-${page.pageNumber}-${index + 1}`, page: page.pageNumber });
      });
    }
    const searchable = totalElements > 0;
    const design = starterDesign(documentType, 'BLANK');
    design.variant = 'BLANK';
    design.header.visible = false;
    design.header.showLogo = false;
    design.page.showPageNumbers = false;
    design.blocks = [];
    design.importedCanvas = {
      mode: 'EXACT_PDF',
      sourceFileName: fileName,
      rasterDpi: 144,
      pages: canvasPages,
      logos,
      logo: logos[0] || null,
      textEditable: searchable
    };
    design.importAnalysis = {
      sourceFormat: 'PDF',
      fileName,
      pageCount: canvasPages.length,
      status: searchable ? 'EXACT_LAYOUT' : 'NEEDS_REVIEW',
      quality: searchable ? 'GOOD' : 'LOW',
      extractedText: canvasPages.flatMap((page) => page.textElements.map((item) => item.originalText)).join('\n').slice(0, 24000),
      detectedFields: [],
      warnings: searchable
        ? ['The original PDF layout is preserved. Review suggested data fields before publishing; no Rev Engine sections were added automatically.']
        : ['The original pages were preserved, but no editable text layer was found. This is likely a scanned document. Searchable PDFs or DOCX files are strongly recommended.'],
      convertedAt: new Date().toISOString()
    };
    return {
      design: normalizeDesign(design, documentType),
      status: searchable ? 'EXACT_LAYOUT' : 'NEEDS_REVIEW',
      warnings: design.importAnalysis.warnings,
      assets
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  exactCanvasDesign,
  parseBboxLayout,
  suggestedBinding
};
