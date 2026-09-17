// Генерация иконок приложения официанта: латунная B на еловом фоне.
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('node:fs');
const path = require('node:path');

const OUT = process.argv[2];
if (!OUT) {
  console.error('нужен путь до res/');
  process.exit(1);
}

const GROUND = '#14200D';
const BRASS = '#C8A55C';

const sizes = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192]
];

function pickFont(size) {
  // Impact узкий и стоит на каждой Windows, он ближе всего к Oswald.
  return `bold ${size}px Impact, "Arial Black", Arial, sans-serif`;
}

function draw(size, round) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');

  ctx.save();
  if (round) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
  }

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, size, size);

  // Тонкая латунная рамка по краю, на мелких плотностях её почти не видно, и это нормально.
  ctx.strokeStyle = 'rgba(200,165,92,0.45)';
  ctx.lineWidth = Math.max(1, Math.round(size * 0.02));
  if (round) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const i = ctx.lineWidth / 2;
    ctx.strokeRect(i, i, size - ctx.lineWidth, size - ctx.lineWidth);
  }

  ctx.fillStyle = BRASS;
  ctx.font = pickFont(Math.round(size * 0.62));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('B', size / 2, size / 2 + size * 0.03);

  ctx.restore();
  return c.toBuffer('image/png');
}

for (const [dir, size] of sizes) {
  const target = path.join(OUT, dir);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'ic_launcher.png'), draw(size, false));
  fs.writeFileSync(path.join(target, 'ic_launcher_round.png'), draw(size, true));
  console.log(dir, size, 'ок');
}
