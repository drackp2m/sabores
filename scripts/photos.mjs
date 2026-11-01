// Generates the WebP versions of the photos in data/photos: a smaller one for the thumbnails and one
// at their real size to view them enlarged (photoUrl, in src/app/venues.ts). The JPGs are the
// originals, and stay out of the app. Run it when the photos change and commit the result.
//
//   pnpm photos
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const FOLDER = path.join(import.meta.dirname, '..', 'data', 'photos');
// In a card, a photo measures up to 11rem (176 px), and about 166 px in a phone's gallery: on an
// iPhone, which has three pixels for each of those, that takes almost 500.
const VERSIONS = [
  { width: 500, quality: 75 },
  { width: 690, quality: 80 },
];

const jpg = fs.readdirSync(FOLDER).filter((file) => file.endsWith('.jpg'));
const size = (file) => fs.statSync(file).size;
const totals = new Map(VERSIONS.map(({ width }) => [width, 0]));
for (const file of jpg) {
  const original = path.join(FOLDER, file);
  for (const { width, quality } of VERSIONS) {
    const target = path.join(FOLDER, `${path.basename(file, '.jpg')}-${width}.webp`);
    await sharp(original).resize({ width }).webp({ quality, effort: 6 }).toFile(target);
    totals.set(width, totals.get(width) + size(target));
  }
}

const megabytes = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
console.log(
  `${jpg.length} photos, ${megabytes(jpg.reduce((a, f) => a + size(path.join(FOLDER, f)), 0))} as JPG`,
);
for (const [width, bytes] of totals) console.log(`  at ${width} px: ${megabytes(bytes)}`);
