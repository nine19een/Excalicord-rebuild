export type AspectRatioItem = {
  key: '16:9' | '4:3' | '3:4' | '9:16' | '1:1';
  label: string;
  ratio: number;
};

export const aspectRatioOptions: AspectRatioItem[] = [
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: '3:4', label: '3:4', ratio: 3 / 4 },
  { key: '9:16', label: '9:16', ratio: 9 / 16 },
  { key: '1:1', label: '1:1', ratio: 1 },
];

export type BackgroundCategory = {
  key: 'all' | 'soft' | 'deep' | 'nature';
  label: string;
};

export type BackgroundSwatch = {
  id: string;
  label: string;
  color: string;
  category: BackgroundCategory['key'];
};

export const backgroundCategories: BackgroundCategory[] = [
  { key: 'all', label: '全部' },
  { key: 'soft', label: '浅色' },
  { key: 'deep', label: '冷色' },
  { key: 'nature', label: '自然' },
];

export const backgroundOptions: BackgroundSwatch[] = [
  { id: 'bg-white', label: '纯白', color: '#ffffff', category: 'soft' },
  { id: 'bg-ivory', label: '米白', color: '#f8f5ef', category: 'soft' },
  { id: 'bg-sky', label: '浅蓝', color: '#eef6ff', category: 'soft' },
  { id: 'bg-mint', label: '薄荷', color: '#eafbeb', category: 'nature' },
  { id: 'bg-peach', label: '桃粉', color: '#fff2f0', category: 'nature' },
  { id: 'bg-forest', label: '森绿', color: '#e9f8f1', category: 'nature' },
  { id: 'bg-stone', label: '石墨', color: '#f1f2f6', category: 'deep' },
  { id: 'bg-night', label: '夜色', color: '#eef2ff', category: 'deep' },
  { id: 'bg-ink', label: '墨蓝', color: '#f3f5ff', category: 'deep' },
];
