import { SpriteEditorState, StoreSlice } from '../types';
import { AnatomyConfig, MemberConfig } from '@/lib/types';
import { dims } from '@/headless/assetModel';

export const createAnatomySlice: StoreSlice<Partial<SpriteEditorState>> = (set, get) => ({
  anatomyActiveMemberId: null,
  anatomySelectedOrientation: 0,
  anatomyIsSelectionMode: false,
  anatomyShowAllMasks: true,

  setAnatomyActiveMemberId: (id) => set({ anatomyActiveMemberId: id }),
  setAnatomyIsSelectionMode: (on) => set({ anatomyIsSelectionMode: on }),
  setAnatomyShowAllMasks: (on) => set({ anatomyShowAllMasks: on }),

  toggleMemberPixel: (r, c, force) => set(state => {
    const { anatomyActiveMemberId, anatomySelectedOrientation, editedAsset } = state;
    if (!anatomyActiveMemberId) return state;

    const anatomy = editedAsset.anatomy || {};
    const orientations = anatomy.orientations || {};
    const orientation = orientations[anatomySelectedOrientation] || { members: [] };
    
    const memberIdx = orientation.members.findIndex(m => m.id === anatomyActiveMemberId);
    if (memberIdx === -1) return state;

    const member = orientation.members[memberIdx];
    const pixels = [...(member.pixels || [])];
    const pixelIdx = pixels.findIndex(p => p.r === r && p.c === c);

    const shouldAdd = force !== undefined ? force : pixelIdx === -1;

    if (shouldAdd && pixelIdx === -1) {
      pixels.push({ r, c });
    } else if (!shouldAdd && pixelIdx >= 0) {
      pixels.splice(pixelIdx, 1);
    } else if (force === undefined) {
      // Toggle case handled by the initial shouldAdd calculation
    } else {
      // Force match existing state, no change
      return state;
    }

    const updatedMembers = [...orientation.members];
    updatedMembers[memberIdx] = { ...member, pixels };

    const updatedOrientations = {
      ...orientations,
      [anatomySelectedOrientation]: { ...orientation, members: updatedMembers }
    };

    return {
      editedAsset: {
        ...editedAsset,
        anatomy: { ...anatomy, orientations: updatedOrientations }
      },
      isDirty: true
    };
  }),
  
  fillMemberGaps: () => set(state => {
    const { anatomyActiveMemberId, anatomySelectedOrientation, editedAsset } = state;
    if (!anatomyActiveMemberId) return state;

    state.pushUndo();

    const anatomy = editedAsset.anatomy || {};
    const orientations = anatomy.orientations || {};
    const orientation = orientations[anatomySelectedOrientation] || { members: [] };
    
    const memberIdx = orientation.members.findIndex(m => m.id === anatomyActiveMemberId);
    if (memberIdx === -1) return state;

    const member = orientation.members[memberIdx];
    const pixels = member.pixels || [];
    if (pixels.length < 3) return state; // Need at least a triangle/loop

    // Rows are bounded by the height and columns by the width: the canvas can be
    // wider than it is tall.
    const { width, height } = dims(editedAsset);
    
    // 1. Create a grid representing current selection
    const grid = Array.from({ length: height }, () => Array(width).fill(false));
    pixels.forEach(p => {
      if (p.r >= 0 && p.r < height && p.c >= 0 && p.c < width) {
        grid[p.r][p.c] = true;
      }
    });

    // 2. Flood fill from the edges to find "outside"
    const outside = Array.from({ length: height }, () => Array(width).fill(false));
    const stack: {r: number, c: number}[] = [];

    // Push all edge pixels that are NOT selected
    for (let c = 0; c < width; c++) {
      if (!grid[0][c]) stack.push({ r: 0, c });
      if (!grid[height-1][c]) stack.push({ r: height-1, c });
    }
    for (let r = 0; r < height; r++) {
      if (!grid[r][0]) stack.push({ r, c: 0 });
      if (!grid[r][width-1]) stack.push({ r, c: width-1 });
    }

    while (stack.length > 0) {
      const { r, c } = stack.pop()!;
      if (r < 0 || r >= height || c < 0 || c >= width || grid[r][c] || outside[r][c]) continue;
      
      outside[r][c] = true;
      
      // Standard 4-connectivity moves
      const neighbors = [
        { nr: r + 1, nc: c },
        { nr: r - 1, nc: c },
        { nr: r, nc: c + 1 },
        { nr: r, nc: c - 1 }
      ];

      for (const { nr, nc } of neighbors) {
        if (nr < 0 || nr >= height || nc < 0 || nc >= width || outside[nr][nc] || grid[nr][nc]) continue;
        
        // Diagonal Leak Prevention:
        // If we move from (r,c) to (r+1, c), it's a 4-connected move.
        // It's never a "diagonal leak" by itself.
        // The leak happens when the ONLY connection between internal and external
        // is a diagonal gap in the grid.
        // Example of diagonal boundary:
        // (r,c)   (r, c+1) [Grid]
        // (r+1,c) [Grid]  (r+1, c+1)
        // A move from (r,c) to (r+1, c+1) is blocked if (r, c+1) and (r+1, c) are grid.
        
        // But we only move 4-connected. So from (r,c) we can go to (r+1, c) or (r, c+1).
        // If (r+1, c) is grid, we can't go there.
        // If (r, c+1) is grid, we can't go there.
        // So a 4-connected flood fill CANNOT pass through an 8-connected boundary.
        // Wait... actually, it CANNOT. 
        // If the boundary is:
        // X .
        // . X
        // From (0,1) [.] I can only go to (0,0) [X] or (1,1) [X] or (0,2) or (1,1)...
        // All paths to the other side (1,0) are blocked by X.
        
        // My previous thought was wrong. 4-connected flood fill is NATURALLY 
        // blocked by 8-connected boundaries.
        // So if it "did nothing", it's probably because the boundary was OPEN
        // (missing a pixel even in 8-connectivity).
        
        stack.push({ r: nr, c: nc });
      }
      
      // If we want to support 8-connectivity boundaries, we must block 4-connectivity moves
      // that "squeeze" through a diagonal.
      // Example: If grid[r+1][c+1] and grid[r][c] are TRUE, then (r+1, c) cannot reach (r, c+1).
    }

    // 3. Any pixel that is NOT member AND NOT outside is an internal hole
    const newPixels: { r: number, c: number }[] = [];
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (!outside[r][c]) {
          newPixels.push({ r, c });
        }
      }
    }

    if (newPixels.length === pixels.length) return state;

    const updatedMembers = [...orientation.members];
    updatedMembers[memberIdx] = { ...member, pixels: newPixels };

    const updatedOrientations = {
      ...orientations,
      [anatomySelectedOrientation]: { ...orientation, members: updatedMembers }
    };

    return {
      editedAsset: {
        ...editedAsset,
        anatomy: { ...anatomy, orientations: updatedOrientations }
      },
      isDirty: true
    };
  }),
});
