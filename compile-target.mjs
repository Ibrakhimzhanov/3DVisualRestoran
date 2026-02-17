import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Detector } from './node_modules/mind-ar/src/image-target/detector/detector.js';
import { buildImageList, buildTrackingImageList } from './node_modules/mind-ar/src/image-target/image-list.js';
import { build as hierarchicalClusteringBuild } from './node_modules/mind-ar/src/image-target/matching/hierarchical-clustering.js';
import * as msgpack from '@msgpack/msgpack';
import * as tf from '@tensorflow/tfjs';
import './node_modules/mind-ar/src/image-target/detector/kernels/cpu/index.js';

const CURRENT_VERSION = 2;

async function compile(imagePath) {
  console.log(`Loading image: ${imagePath}`);
  const img = await loadImage(imagePath);

  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, img.width, img.height);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);

  const greyImageData = new Uint8Array(img.width * img.height);
  for (let i = 0; i < greyImageData.length; i++) {
    const offset = i * 4;
    greyImageData[i] = Math.floor(
      (imageData.data[offset] + imageData.data[offset + 1] + imageData.data[offset + 2]) / 3
    );
  }

  const targetImage = { data: greyImageData, height: img.height, width: img.width };
  console.log(`Image: ${img.width}x${img.height}`);

  console.log('Building image list...');
  const imageList = buildImageList(targetImage);
  console.log(`Image list: ${imageList.length} levels`);

  console.log('Extracting features...');
  const matchingData = [];
  for (let i = 0; i < imageList.length; i++) {
    const image = imageList[i];
    const detector = new Detector(image.width, image.height);

    await tf.nextFrame();
    const points = tf.tidy(() => {
      const inputT = tf.tensor(image.data, [image.data.length], 'float32')
        .reshape([image.height, image.width]);
      const { featurePoints } = detector.detect(inputT);
      return featurePoints;
    });

    matchingData.push(points);
    process.stdout.write(`\r  Level ${i + 1}/${imageList.length}`);
  }
  console.log('');

  console.log('Building tracking data...');
  const trackingImageList = buildTrackingImageList(targetImage);
  const trackingData = trackingImageList.map(image => ({
    data: Array.from(image.data),
    width: image.width,
    height: image.height,
    scale: image.scale
  }));

  const data = [{
    targetImage: {
      width: targetImage.width,
      height: targetImage.height,
    },
    imageList: imageList.map(img => ({
      width: img.width,
      height: img.height,
      scale: img.scale,
    })),
    matchingData: matchingData.map(points =>
      points ? points.map(p => ({
        x: p.x, y: p.y,
        angle: p.angle,
        descriptors: p.descriptors,
        scale: p.scale || 1,
      })) : []
    ),
    trackingData: trackingData,
  }];

  const buffer = msgpack.encode({
    v: CURRENT_VERSION,
    trackingData: data
  });

  const fs = await import('fs');
  fs.writeFileSync('targets.mind', Buffer.from(buffer));
  console.log(`Done! Saved targets.mind (${(buffer.byteLength / 1024).toFixed(0)} KB)`);
}

compile(process.argv[2] || 'scan-optimized.jpg').catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
