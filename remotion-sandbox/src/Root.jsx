import React from 'react';
import { Composition } from 'remotion';
import { Promo } from './Promo';
import { PromoVertical, VERTICAL_TOTAL } from './PromoVertical';
import { FPS, TOTAL } from './theme';

export const Root = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="PromoVertical" component={PromoVertical} durationInFrames={VERTICAL_TOTAL} fps={FPS} width={1080} height={1920} />
  </>
);
