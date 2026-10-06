import { describe, it, expect } from 'vitest';
import { serializeAsset, deserializeAsset } from './spriteDto';
import type { SpriteAsset, Frame } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SIZES = [16, 32, 64, 128] as const;

function makeRealisticFrame(size: number, seed = 0): Frame {
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => {
      const dr = r - size / 2;
      const dc = c - size / 2;
      return Math.sqrt(dr * dr + dc * dc) < size / 3.5
        ? ((r * size + c + seed) % 12) + 1
        : 0;
    })
  );
}

function makeWalkFrame(base: Frame, size: number, t: number): Frame {
  const cx = Math.floor(size / 2);
  const f: Frame = base.map(row => [...row]);
  const shift = Math.round(Math.sin((t * Math.PI) / 3) * Math.max(1, Math.floor(size * 0.06)));
  for (let r = Math.floor(size * 0.6); r < Math.floor(size * 0.9); r++) {
    const srcC = Math.max(0, cx - 2);
    f[r][srcC] = 0;
    const dst = Math.min(size - 1, Math.max(0, srcC + shift));
    f[r][dst] = base[r]?.[srcC] ?? 0;
  }
  return f;
}

function makeAsset(size: number, numFrames = 8): SpriteAsset {
  const base = makeRealisticFrame(size);
  const frames: Frame[] = [base];
  for (let t = 1; t < numFrames; t++) frames.push(makeWalkFrame(base, size, t));

  return {
    id: `test-${size}`,
    name: `Test ${size}x${size}`,
    description: '',
    category: 'character',
    size,
    palette: { 0: 'transparent', 1: '#ff0000', 2: '#00ff00', 3: '#0000ff' },
    colorNames: { 0: 'Transparent', 1: 'Red', 2: 'Green', 3: 'Blue' },
    layers: [
      {
        id: 'base',
        name: 'Base',
        isVisible: true,
        isLocked: false,
        opacity: 1,
        frames,
      },
    ],
    animations: [
      { name: 'walk', label: 'Walk', frameIndices: [0, 1, 2, 3, 4, 5, 6, 7], fps: 8 },
    ],
  };
}

function makeEmptyFrame(size: number): Frame {
  return Array.from({ length: size }, () => Array<number>(size).fill(0));
}

// ---------------------------------------------------------------------------
// Round-trip integrity
// ---------------------------------------------------------------------------

describe('spriteDto — round-trip integrity', () => {
  SIZES.forEach(size => {
    it(`round-trips a ${size}×${size} walk animation without data loss`, () => {
      const asset = makeAsset(size, 8);
      const dto = serializeAsset(asset);
      const restored = deserializeAsset(dto);

      const original = asset.layers![0].frames;
      const result = restored.layers![0].frames;

      expect(result).toHaveLength(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(result[i]).toEqual(original[i]);
      }
    });
  });

  it('preserves all metadata fields', () => {
    const asset = makeAsset(32);
    const restored = deserializeAsset(serializeAsset(asset));
    expect(restored.id).toBe(asset.id);
    expect(restored.name).toBe(asset.name);
    expect(restored.size).toBe(asset.size);
    expect(restored.category).toBe(asset.category);
    expect(restored.palette).toEqual(asset.palette);
    expect(restored.colorNames).toEqual(asset.colorNames);
    expect(restored.animations).toEqual(asset.animations);
    expect(restored.description).toBe(asset.description);
  });

  it('handles assets with empty frame arrays', () => {
    const asset = makeAsset(16, 1);
    asset.layers![0].frames = [];
    const restored = deserializeAsset(serializeAsset(asset));
    expect(restored.layers![0].frames).toHaveLength(0);
  });

  it('round-trips assets with a single frame', () => {
    const asset = makeAsset(32, 1);
    const restored = deserializeAsset(serializeAsset(asset));
    expect(restored.layers![0].frames[0]).toEqual(asset.layers![0].frames[0]);
  });

  it('handles assets with multiple layers', () => {
    const base = makeAsset(32, 4);
    const asset: SpriteAsset = {
      ...base,
      layers: [
        { id: 'l1', name: 'Background', isVisible: true, isLocked: false, opacity: 1, frames: [makeEmptyFrame(32)] },
        { id: 'l2', name: 'Body', isVisible: true, isLocked: false, opacity: 1, frames: base.layers![0].frames },
        { id: 'l3', name: 'Overlay', isVisible: false, isLocked: true, opacity: 0.5, frames: [makeRealisticFrame(32)] },
      ],
    };
    const restored = deserializeAsset(serializeAsset(asset));
    expect(restored.layers).toHaveLength(3);
    expect(restored.layers![2].isVisible).toBe(false);
    expect(restored.layers![2].opacity).toBe(0.5);
    expect(restored.layers![0].frames[0]).toEqual(makeEmptyFrame(32));
  });

  it('round-trips assets with versions (recursive)', () => {
    const inner = makeAsset(16, 2);
    const asset: SpriteAsset = {
      ...makeAsset(16, 2),
      versions: [{ id: 'v1', timestamp: '2024-01-01T00:00:00Z', name: 'Checkpoint 1', asset: inner as any }],
    };
    const restored = deserializeAsset(serializeAsset(asset));
    const versionLayer = (restored.versions![0].asset as SpriteAsset).layers![0];
    expect(versionLayer.frames[0]).toEqual(inner.layers![0].frames[0]);
  });
});

// ---------------------------------------------------------------------------
// RLE encoding
// ---------------------------------------------------------------------------

describe('spriteDto — RLE encoding', () => {
  it('encodes an all-zero frame as a minimal RLE string', () => {
    const asset = makeAsset(32, 1);
    asset.layers![0].frames = [makeEmptyFrame(32)];
    const dto = serializeAsset(asset);
    const encoded = (dto.layers![0] as any).frames[0];
    expect(encoded).toBe('1024x0');
  });

  it('encodes a 16×16 empty frame correctly', () => {
    const asset = makeAsset(16, 1);
    asset.layers![0].frames = [makeEmptyFrame(16)];
    const dto = serializeAsset(asset);
    expect((dto.layers![0] as any).frames[0]).toBe('256x0');
  });

  it('encodes a 64×64 empty frame correctly', () => {
    const asset = makeAsset(64, 1);
    asset.layers![0].frames = [makeEmptyFrame(64)];
    const dto = serializeAsset(asset);
    expect((dto.layers![0] as any).frames[0]).toBe('4096x0');
  });

  it('encodes a 128×128 empty frame correctly', () => {
    const asset = makeAsset(128, 1);
    asset.layers![0].frames = [makeEmptyFrame(128)];
    const dto = serializeAsset(asset);
    expect((dto.layers![0] as any).frames[0]).toBe('16384x0');
  });

  it('expansion guard: worst-case frames are never larger than raw', () => {
    // Frame with no runs (every pixel different index) — RLE would expand badly
    const size = 16;
    const worstCase: Frame = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => (r * size + c) % 15 + 1)
    );
    const asset = makeAsset(size, 1);
    asset.layers![0].frames = [worstCase];

    const dto = serializeAsset(asset);
    const encoded = (dto.layers![0] as any).frames[0];
    const rawSize = JSON.stringify(worstCase).length;
    const encodedSize = typeof encoded === 'string' ? encoded.length : JSON.stringify(encoded).length;
    // Encoded must never exceed raw (guard must activate)
    expect(encodedSize).toBeLessThanOrEqual(rawSize);
  });

  it('decodes RLE correctly with palette indices > 9', () => {
    const size = 4;
    const frame: Frame = [
      [10, 11, 12, 13],
      [14, 15, 10, 11],
      [0, 0, 0, 0],
      [15, 15, 15, 15],
    ];
    const asset = makeAsset(size, 1);
    asset.layers![0].frames = [frame];
    (asset as any).size = size;
    const restored = deserializeAsset(serializeAsset(asset));
    expect(restored.layers![0].frames[0]).toEqual(frame);
  });
});

// ---------------------------------------------------------------------------
// Delta encoding
// ---------------------------------------------------------------------------

describe('spriteDto — delta encoding', () => {
  it('encodes identical frames as "D:" (empty delta)', () => {
    const size = 16;
    const frame = makeRealisticFrame(size);
    const asset = makeAsset(size, 1);
    asset.layers![0].frames = [frame, frame];
    const dto = serializeAsset(asset);
    expect((dto.layers![0] as any).frames[1]).toBe('D:');
  });

  it('round-trips a frame encoded as delta', () => {
    const size = 32;
    const base = makeRealisticFrame(size);
    const walk1 = makeWalkFrame(base, size, 1);
    const asset = makeAsset(size, 1);
    asset.layers![0].frames = [base, walk1];
    const restored = deserializeAsset(serializeAsset(asset));
    expect(restored.layers![0].frames[1]).toEqual(walk1);
  });

  it('uses delta (not RLE) for walk frames with few pixel changes', () => {
    const size = 32;
    const base = makeRealisticFrame(size);
    const walk1 = makeWalkFrame(base, size, 1);
    const asset = makeAsset(size, 1);
    asset.layers![0].frames = [base, walk1];
    const dto = serializeAsset(asset);
    const f1 = (dto.layers![0] as any).frames[1] as string;
    // For a walk frame with ~26 changed pixels, delta should win over RLE
    expect(typeof f1).toBe('string');
    expect(f1.startsWith('D:')).toBe(true);
  });

  it('a sequence of 10 identical frames all become "D:" after the keyframe', () => {
    const size = 32;
    const frame = makeRealisticFrame(size);
    const asset = makeAsset(size, 1);
    asset.layers![0].frames = Array(10).fill(frame);
    const dto = serializeAsset(asset);
    const encodedFrames = (dto.layers![0] as any).frames as string[];
    // Frame 0 is the keyframe (RLE), frames 1-9 should all be "D:"
    for (let i = 1; i < 10; i++) {
      expect(encodedFrames[i]).toBe('D:');
    }
  });

  it('delta round-trip: full walk cycle (8 frames)', () => {
    SIZES.forEach(size => {
      const base = makeRealisticFrame(size);
      const frames: Frame[] = [base];
      for (let t = 1; t < 8; t++) frames.push(makeWalkFrame(base, size, t));

      const asset = makeAsset(size, 1);
      asset.layers![0].frames = frames;
      const restored = deserializeAsset(serializeAsset(asset));

      for (let i = 0; i < frames.length; i++) {
        expect(restored.layers![0].frames[i]).toEqual(frames[i]);
      }
    });
  });

  it('falls back to best encoding for completely different frames', () => {
    const size = 16;
    const f1 = makeRealisticFrame(size, 0);
    const f2 = makeRealisticFrame(size, 200); // Very different
    const asset = makeAsset(size, 1);
    asset.layers![0].frames = [f1, f2];
    const restored = deserializeAsset(serializeAsset(asset));
    // Whatever encoding was chosen, round-trip must be correct
    expect(restored.layers![0].frames[1]).toEqual(f2);
  });
});

// ---------------------------------------------------------------------------
// Compression ratio regression guards
// ---------------------------------------------------------------------------

describe('spriteDto — compression ratios', () => {
  SIZES.forEach(size => {
    // 16×16: metadata (palette, animations) is proportionally larger vs frame data
    // so the ceiling is 25%. Larger sizes easily hit < 20%.
    const threshold = size === 16 ? 0.25 : 0.20;
    it(`${size}×${size} walk animation (8 frames) serializes to < ${threshold * 100}% of raw`, () => {
      const asset = makeAsset(size, 8);
      const raw = JSON.stringify(asset).length;
      const serialized = JSON.stringify(serializeAsset(asset)).length;
      expect(serialized / raw).toBeLessThan(threshold);
    });
  });

  it('3-layer asset with shared frames compresses well across all layers', () => {
    const size = 32;
    const base = makeAsset(size, 6);
    const asset: SpriteAsset = {
      ...base,
      layers: [
        { ...base.layers![0], id: 'l1' },
        { ...base.layers![0], id: 'l2' },
        { ...base.layers![0], id: 'l3' },
      ],
    };
    const raw = JSON.stringify(asset).length;
    const serialized = JSON.stringify(serializeAsset(asset)).length;
    // 3 layers of same data should still compress well
    expect(serialized / raw).toBeLessThan(0.20);
  });
});

// ---------------------------------------------------------------------------
// Non-square canvases (a map ground is 448×224, never a square)
// ---------------------------------------------------------------------------

describe('non-square canvases', () => {
  const nonSquare = (width: number, height: number, frames: Frame[]): SpriteAsset => ({
    id: 'mapa',
    name: 'Mapa',
    description: '',
    category: 'terrain',
    size: Math.max(width, height),
    width,
    height,
    palette: { 0: 'transparent', 1: '#000000', 2: '#ffffff' },
    colorNames: {},
    layers: [{ id: 'layer-base', name: 'Base', isVisible: true, isLocked: false, opacity: 1, frames }],
    animations: [],
  });

  const grid = (width: number, height: number, f: (r: number, c: number) => number): Frame =>
    Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => f(r, c)));

  it('keeps the shape of a wide frame through the round trip (RLE keyframe)', () => {
    const [w, h] = [28, 7];
    const frame = grid(w, h, (r, c) => ((r + c) % 3 === 0 ? 1 : 0));
    const back = deserializeAsset(serializeAsset(nonSquare(w, h, [frame])));
    const out = back.layers![0].frames[0];
    expect(out.length).toBe(h);
    expect(out.every(row => row.length === w)).toBe(true);
    expect(out).toEqual(frame);
  });

  it('keeps the shape of a tall frame through the round trip', () => {
    const [w, h] = [7, 28];
    const frame = grid(w, h, (r, c) => ((r * 2 + c) % 5 === 0 ? 2 : 0));
    const back = deserializeAsset(serializeAsset(nonSquare(w, h, [frame])));
    expect(back.layers![0].frames[0]).toEqual(frame);
  });

  it('lands a delta on the right pixel of a wide frame', () => {
    // The stride is the width: with the old code (stride = row count) every
    // changed pixel of a 28×7 frame came back somewhere else entirely.
    const [w, h] = [28, 7];
    const a = grid(w, h, () => 1);
    const b = a.map(row => [...row]);
    b[5][27] = 2;
    b[0][13] = 2;
    const back = deserializeAsset(serializeAsset(nonSquare(w, h, [a, b])));
    expect(back.layers![0].frames[1]).toEqual(b);
  });

  it('survives a long sequence of deltas on a non-square canvas', () => {
    const [w, h] = [20, 9];
    const frames: Frame[] = [grid(w, h, (r, c) => ((r + c) % 2) + 1)];
    for (let t = 1; t < 8; t++) {
      const f = frames[t - 1].map(row => [...row]);
      f[t % h][(t * 3) % w] = (t % 2) + 1;
      frames.push(f);
    }
    const back = deserializeAsset(serializeAsset(nonSquare(w, h, frames)));
    expect(back.layers![0].frames).toEqual(frames);
  });

  it('falls back to size when width and height are absent (legacy assets)', () => {
    const frame = grid(8, 8, (r, c) => (r === c ? 1 : 0));
    const asset = nonSquare(8, 8, [frame]);
    delete asset.width;
    delete asset.height;
    expect(deserializeAsset(serializeAsset(asset)).layers![0].frames[0]).toEqual(frame);
  });
});
