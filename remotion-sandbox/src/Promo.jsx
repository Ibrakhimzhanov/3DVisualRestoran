// Сборка мастера 16:9. Порядок сцен и длительности берутся из theme.js
import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { loadFont } from '@remotion/google-fonts/GolosText';
import { SCENES, T } from './theme';
import { SceneProblem, SceneHabit, SceneTap, SceneReveal, SceneCard, SceneUpsell, SceneWaiter, SceneStats, SceneFinal } from './scenes';

loadFont();

const MAP = {
  problem: SceneProblem,
  habit: SceneHabit,
  tap: SceneTap,
  reveal: SceneReveal,
  card: SceneCard,
  upsell: SceneUpsell,
  waiter: SceneWaiter,
  stats: SceneStats,
  final: SceneFinal,
};

export const Promo = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: T.stage }}>
      {SCENES.map((s) => {
        const Comp = MAP[s.id];
        const el = (
          <Sequence key={s.id} from={from} durationInFrames={s.frames} name={s.id}>
            <Comp />
          </Sequence>
        );
        from += s.frames;
        return el;
      })}
    </AbsoluteFill>
  );
};
