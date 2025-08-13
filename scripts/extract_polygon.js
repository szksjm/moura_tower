const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const GAME_CONFIG = {
  animal: {
    targetSize: 90,
    minSize: 60,
    maxSize: 120
  }
};

function decodePNG(buffer) {
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  if (!buffer.slice(0,8).equals(signature)) {
    throw new Error('Invalid PNG signature');
  }
  let offset = 8;
  let width, height;
  let idatChunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset); offset += 4;
    const type = buffer.toString('ascii', offset, offset+4); offset += 4;
    const data = buffer.slice(offset, offset+length); offset += length;
    offset += 4; // skip CRC
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      if (bitDepth !== 8 || colorType !== 6) {
        throw new Error('Unsupported PNG format');
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  const compressed = Buffer.concat(idatChunks);
  const decompressed = zlib.inflateSync(compressed);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const raw = Buffer.alloc(width * height * bytesPerPixel);
  let i = 0;
  let offsetRaw = 0;
  let prevScanline = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filterType = decompressed[i++];
    const scanline = decompressed.slice(i, i + stride); i += stride;
    const recon = Buffer.alloc(stride);
    switch (filterType) {
      case 0: // None
        scanline.copy(recon);
        break;
      case 1: // Sub
        for (let x = 0; x < stride; x++) {
          const left = x >= bytesPerPixel ? recon[x - bytesPerPixel] : 0;
          recon[x] = (scanline[x] + left) & 0xff;
        }
        break;
      case 2: // Up
        for (let x = 0; x < stride; x++) {
          const up = prevScanline[x];
          recon[x] = (scanline[x] + up) & 0xff;
        }
        break;
      case 3: // Average
        for (let x = 0; x < stride; x++) {
          const left = x >= bytesPerPixel ? recon[x - bytesPerPixel] : 0;
          const up = prevScanline[x];
          recon[x] = (scanline[x] + Math.floor((left + up) / 2)) & 0xff;
        }
        break;
      case 4: // Paeth
        for (let x = 0; x < stride; x++) {
          const left = x >= bytesPerPixel ? recon[x - bytesPerPixel] : 0;
          const up = prevScanline[x];
          const upLeft = x >= bytesPerPixel ? prevScanline[x - bytesPerPixel] : 0;
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          let pr;
          if (pa <= pb && pa <= pc) pr = left;
          else if (pb <= pc) pr = up;
          else pr = upLeft;
          recon[x] = (scanline[x] + pr) & 0xff;
        }
        break;
      default:
        throw new Error('Unsupported filter type: ' + filterType);
    }
    recon.copy(raw, offsetRaw);
    prevScanline = recon;
    offsetRaw += stride;
  }
  return { width, height, data: raw };
}

function calculateOptimalScale(imgWidth, imgHeight, targetSize) {
  let scale;
  if (imgWidth >= imgHeight) {
    scale = targetSize / imgWidth;
  } else {
    scale = targetSize / imgHeight;
  }
  const resultWidth = imgWidth * scale;
  const resultHeight = imgHeight * scale;
  const maxDimension = Math.max(resultWidth, resultHeight);
  if (maxDimension > GAME_CONFIG.animal.maxSize) {
    scale = GAME_CONFIG.animal.maxSize / Math.max(imgWidth, imgHeight);
  } else if (maxDimension < GAME_CONFIG.animal.minSize) {
    scale = GAME_CONFIG.animal.minSize / Math.max(imgWidth, imgHeight);
  }
  return scale;
}

function simplifyPolygon(points, maxVertices) {
  if (points.length <= maxVertices) return points;
  const simplified = [];
  const step = Math.ceil(points.length / maxVertices);
  for (let i = 0; i < points.length; i += step) {
    simplified.push(points[i]);
  }
  return simplified;
}

function createPolygonFromImage(png, scale, threshold = 128) {
  const { width, height, data } = png;
  const contourPoints = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 20));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha > threshold) {
        contourPoints.push({
          x: (x - width / 2) * scale,
          y: (y - height / 2) * scale
        });
        break;
      }
    }
    for (let x = width - 1; x >= 0; x--) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha > threshold) {
        const point = {
          x: (x - width / 2) * scale,
          y: (y - height / 2) * scale
        };
        const isDuplicate = contourPoints.some(p => Math.abs(p.x - point.x) < 5 && Math.abs(p.y - point.y) < 5);
        if (!isDuplicate) contourPoints.push(point);
        break;
      }
    }
  }

  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha > threshold) {
        contourPoints.push({
          x: (x - width / 2) * scale,
          y: (y - height / 2) * scale
        });
        break;
      }
    }
    for (let y = height - 1; y >= 0; y--) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha > threshold) {
        const point = {
          x: (x - width / 2) * scale,
          y: (y - height / 2) * scale
        };
        const isDuplicate = contourPoints.some(p => Math.abs(p.x - point.x) < 5 && Math.abs(p.y - point.y) < 5);
        if (!isDuplicate) contourPoints.push(point);
        break;
      }
    }
  }

  if (contourPoints.length < 3) {
    console.warn('輪郭抽出に失敗:', { width, height });
    const w = (width * scale) / 2;
    const h = (height * scale) / 2;
    return [
      { x: -w, y: -h },
      { x: w, y: -h },
      { x: w, y: h },
      { x: -w, y: h }
    ];
  }

  const centerX = contourPoints.reduce((sum, p) => sum + p.x, 0) / contourPoints.length;
  const centerY = contourPoints.reduce((sum, p) => sum + p.y, 0) / contourPoints.length;

  contourPoints.sort((a, b) => {
    const angleA = Math.atan2(a.y - centerY, a.x - centerX);
    const angleB = Math.atan2(b.y - centerY, b.x - centerX);
    return angleA - angleB;
  });

  return simplifyPolygon(contourPoints, 16);
}

function processImages() {
  const imageDir = path.resolve('.');
  const polygonDir = path.join(imageDir, 'polygons');
  fs.mkdirSync(polygonDir, { recursive: true });
  const files = fs.readdirSync(imageDir).filter(f => f.toLowerCase().endsWith('.png'));
  files.forEach(file => {
    const filePath = path.join(imageDir, file);
    const buffer = fs.readFileSync(filePath);
    const png = decodePNG(buffer);
    const scale = calculateOptimalScale(png.width, png.height, GAME_CONFIG.animal.targetSize);
    const polygon = createPolygonFromImage(png, scale);
    const base = path.parse(file).name;
    const outPath = path.join(polygonDir, `${base}.json`);
    fs.writeFileSync(outPath, JSON.stringify(polygon, null, 2));
    console.log(`Generated polygon for ${file}`);
  });
}

processImages();
