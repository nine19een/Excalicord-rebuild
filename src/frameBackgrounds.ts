import frameBackground01 from './assets/frame-backgrounds/1.webp';
import frameBackground02 from './assets/frame-backgrounds/2.webp';
import frameBackground03 from './assets/frame-backgrounds/3.webp';
import frameBackground04 from './assets/frame-backgrounds/4.webp';
import frameBackground05 from './assets/frame-backgrounds/5.webp';
import frameBackground06 from './assets/frame-backgrounds/6.webp';
import frameBackground07 from './assets/frame-backgrounds/7.webp';
import frameBackground08 from './assets/frame-backgrounds/8.webp';
import frameBackground09 from './assets/frame-backgrounds/9.webp';
import frameBackground10 from './assets/frame-backgrounds/10.webp';
import frameBackground11 from './assets/frame-backgrounds/11.webp';
import frameBackground12 from './assets/frame-backgrounds/12.webp';
import frameBackground13 from './assets/frame-backgrounds/13.webp';
import frameBackground14 from './assets/frame-backgrounds/14.webp';
import frameBackground15 from './assets/frame-backgrounds/15.webp';
import frameBackground16 from './assets/frame-backgrounds/16.webp';
import frameBackground17 from './assets/frame-backgrounds/17.webp';
import frameBackground18 from './assets/frame-backgrounds/18.webp';
import frameBackground19 from './assets/frame-backgrounds/19.webp';
import frameBackground20 from './assets/frame-backgrounds/20.webp';
import frameBackground21 from './assets/frame-backgrounds/21.webp';

export type FrameBackgroundPreset = {
  id: string;
  name: string;
  src: string;
};

export const frameBackgroundPresets: FrameBackgroundPreset[] = [
  { id: 'frame-bg-01', name: 'Background 01', src: frameBackground01 },
  { id: 'frame-bg-02', name: 'Background 02', src: frameBackground02 },
  { id: 'frame-bg-03', name: 'Background 03', src: frameBackground03 },
  { id: 'frame-bg-04', name: 'Background 04', src: frameBackground04 },
  { id: 'frame-bg-05', name: 'Background 05', src: frameBackground05 },
  { id: 'frame-bg-06', name: 'Background 06', src: frameBackground06 },
  { id: 'frame-bg-07', name: 'Background 07', src: frameBackground07 },
  { id: 'frame-bg-08', name: 'Background 08', src: frameBackground08 },
  { id: 'frame-bg-09', name: 'Background 09', src: frameBackground09 },
  { id: 'frame-bg-10', name: 'Background 10', src: frameBackground10 },
  { id: 'frame-bg-11', name: 'Background 11', src: frameBackground11 },
  { id: 'frame-bg-12', name: 'Background 12', src: frameBackground12 },
  { id: 'frame-bg-13', name: 'Background 13', src: frameBackground13 },
  { id: 'frame-bg-14', name: 'Background 14', src: frameBackground14 },
  { id: 'frame-bg-15', name: 'Background 15', src: frameBackground15 },
  { id: 'frame-bg-16', name: 'Background 16', src: frameBackground16 },
  { id: 'frame-bg-17', name: 'Background 17', src: frameBackground17 },
  { id: 'frame-bg-18', name: 'Background 18', src: frameBackground18 },
  { id: 'frame-bg-19', name: 'Background 19', src: frameBackground19 },
  { id: 'frame-bg-20', name: 'Background 20', src: frameBackground20 },
  { id: 'frame-bg-21', name: 'Background 21', src: frameBackground21 },
];

export const DEFAULT_FRAME_BACKGROUND_COLOR = '#f8fafc';
