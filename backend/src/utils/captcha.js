/**
 * Pure JS visual CAPTCHA SVG generator.
 * Creates clean alphanumeric codes and adds background noise/lines/rotations to prevent simple OCR.
 */

function generateCaptchaCode(length = 6) {
  // Exclude ambiguous chars: O, 0, I, 1, L
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateSvgCaptcha(text) {
  // Scales with the code length so glyphs never crowd or clip at the right edge.
  const width = 32 * text.length;
  const height = 50;
  
  // Background grid pattern
  let gridLines = '';
  for (let i = 10; i < width; i += 16) {
    gridLines += `<line x1="${i}" y1="0" x2="${i}" y2="${height}" stroke="#CFC2FD" stroke-width="0.5" opacity="0.4" />`;
  }
  for (let j = 10; j < height; j += 12) {
    gridLines += `<line x1="0" y1="${j}" x2="${width}" y2="${j}" stroke="#CFC2FD" stroke-width="0.5" opacity="0.4" />`;
  }

  // Curved noise lines
  let curvedLines = '';
  for (let i = 0; i < 2; i++) {
    const startX = Math.floor(Math.random() * 20);
    const startY = Math.floor(Math.random() * height);
    const ctrlX = Math.floor(width / 2 + (Math.random() - 0.5) * 40);
    const ctrlY = Math.floor(Math.random() * height);
    const endX = Math.floor(width - Math.random() * 20);
    const endY = Math.floor(Math.random() * height);
    curvedLines += `<path d="M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}" fill="none" stroke="#8F6BF5" stroke-width="1.5" opacity="0.6" />`;
  }

  // Noise lines (straight)
  let noiseLines = '';
  for (let i = 0; i < 3; i++) {
    const x1 = Math.floor(Math.random() * width);
    const y1 = Math.floor(Math.random() * height);
    const x2 = Math.floor(Math.random() * width);
    const y2 = Math.floor(Math.random() * height);
    noiseLines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#B29BFA" stroke-width="1" opacity="0.5" />`;
  }

  // Noise circles/dots
  let noiseDots = '';
  for (let i = 0; i < 30; i++) {
    const cx = Math.floor(Math.random() * width);
    const cy = Math.floor(Math.random() * height);
    const r = Math.floor(Math.random() * 2) + 1;
    noiseDots += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#B29BFA" opacity="0.6" />`;
  }
  
  // Render characters with rotation & color variations, kept inside the ZeniaHR
  // purple/ink family so the control reads as part of the brand.
  let textElements = '';
  const charWidth = width / (text.length + 1);
  const colors = ['#6C3CF0', '#4C1FD4', '#5B2DE6', '#111827', '#3D19AA', '#8F6BF5'];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const x = charWidth * (i + 0.6) + (Math.random() - 0.5) * 3;
    const y = 34 + (Math.random() - 0.5) * 5;
    const angle = (Math.random() - 0.5) * 30; // -15 to 15 degrees rotation
    const fontSize = Math.floor(Math.random() * 6) + 24; // 24px to 30px
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    textElements += `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${fontSize}" fill="${color}" transform="rotate(${angle} ${x} ${y})">${char}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background-color: #F3F0FF; border-radius: 8px; border: 1px solid #E6E0FE; user-select: none;">
    <rect width="100%" height="100%" fill="#F3F0FF" />
    ${gridLines}
    ${noiseDots}
    ${noiseLines}
    ${curvedLines}
    ${textElements}
  </svg>`;
  
  return svg;
}

module.exports = {
  generateCaptchaCode,
  generateSvgCaptcha
};
