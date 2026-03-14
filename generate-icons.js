const sharp = require('sharp');
const path  = require('path');

// Icon: white filter funnel + envelope flap on a blue rounded-square background
function makeSvg(size) {
  const r  = Math.round(size * 0.22);   // corner radius
  const cx = size / 2;
  const cy = size / 2;

  // Scale strokes & shapes relative to icon size
  const sw = Math.max(1, size * 0.055); // stroke width

  // Envelope body  (centred, occupies ~60% of canvas)
  const ew = size * 0.60;
  const eh = size * 0.42;
  const ex = cx - ew / 2;
  const ey = cy - eh / 2 + size * 0.04;

  // Envelope flap points (V shape from top corners down to centre)
  const flapMid = ey + eh * 0.38;
  const flap = `M${ex},${ey} L${cx},${flapMid} L${ex + ew},${ey}`;

  // Filter funnel (top-right badge area)
  const fs   = size * 0.32;          // funnel bounding box size
  const fx   = ex + ew - fs * 0.35;  // positioned top-right of envelope
  const fy   = ey - fs * 0.55;
  const fp   = 0.18 * fs;            // funnel top padding
  const fbot = fy + fs * 0.85;
  const fstem = fs * 0.18;
  const funnel = [
    `M${fx + fp},${fy}`,
    `L${fx + fs - fp},${fy}`,
    `L${fx + fs * 0.62},${fy + fs * 0.48}`,
    `L${fx + fs * 0.62},${fbot}`,
    `L${fx + fs * 0.38},${fbot}`,
    `L${fx + fs * 0.38},${fy + fs * 0.48}`,
    'Z',
  ].join(' ');

  // White circle badge behind the funnel
  const bcr = fs * 0.62;
  const bcx = fx + fs * 0.5;
  const bcy = fy + fs * 0.45;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#1a73e8"/>

  <!-- Envelope body -->
  <rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" rx="${size * 0.04}" ry="${size * 0.04}"
        fill="none" stroke="white" stroke-width="${sw}" stroke-linejoin="round"/>

  <!-- Envelope flap -->
  <path d="${flap}" fill="none" stroke="white" stroke-width="${sw}"
        stroke-linejoin="round" stroke-linecap="round"/>

  <!-- Badge circle -->
  <circle cx="${bcx}" cy="${bcy}" r="${bcr}" fill="#fbbc04"/>

  <!-- Funnel -->
  <path d="${funnel}" fill="white"/>
</svg>`;
}

async function generate() {
  const sizes = [16, 48, 128];
  for (const size of sizes) {
    const svg = Buffer.from(makeSvg(size));
    const out = path.join(__dirname, 'icons', `icon${size}.png`);
    await sharp(svg).png().toFile(out);
    console.log(`✓ icons/icon${size}.png`);
  }
}

generate().catch(console.error);
