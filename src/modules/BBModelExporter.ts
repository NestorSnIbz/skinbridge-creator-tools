/**
 * BBModelExporter.ts
 * Module to programmatically export the Minecraft Head as a Blockbench .bbmodel file.
 */

// Helper to generate RFC4122 v4 compliant UUIDs
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Converts the skin image element to a base64 encoded data URI.
 */
function getBase64Image(image: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, 64, 64);
  return canvas.toDataURL('image/png');
}

/**
 * Triggers a browser download of the bbmodel content.
 */
function downloadBBModelFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const link = document.createElement('a');
  link.style.display = 'none';
  document.body.appendChild(link);
  
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function createSinglePixelFaces(px: number, py: number) {
  const uv = [px, py, px + 1, py + 1];
  return {
    north: { uv, texture: 0 },
    south: { uv, texture: 0 },
    west: { uv, texture: 0 },
    east: { uv, texture: 0 },
    up: { uv, texture: 0 },
    down: { uv, texture: 0 },
  };
}

function buildClassicBBModel(skinImage: HTMLImageElement) {
  const textureUuid = generateUUID();
  const headCubeUuid = generateUUID();
  const overlayCubeUuid = generateUUID();
  const boneUuid = generateUUID();

  const base64Texture = getBase64Image(skinImage);

  return {
    meta: {
      format_version: '4.9',
      model_format: 'free',
      box_uv: false,
    },
    name: 'cabeza_minecraft',
    model_identifier: 'cabeza_minecraft',
    resolution: {
      width: 64,
      height: 64,
    },
    textures: [
      {
        name: 'skin',
        folder: 'textures',
        namespace: 'minecraft',
        id: '0',
        path: '',
        uuid: textureUuid,
        source: base64Texture,
      },
    ],
    elements: [
      {
        name: 'Head',
        type: 'cube',
        box_uv: false,
        from: [-4, 0, -4],
        to: [4, 8, 4],
        origin: [0, 0, 0],
        uuid: headCubeUuid,
        color: 0,
        locked: false,
        visibility: true,
        faces: {
          north: { uv: [8, 8, 16, 16], texture: 0 },
          south: { uv: [24, 8, 32, 16], texture: 0 },
          west: { uv: [16, 8, 24, 16], texture: 0 },
          east: { uv: [0, 8, 8, 16], texture: 0 },
          up: { uv: [16, 8, 8, 0], texture: 0 },
          down: { uv: [16, 0, 24, 8], texture: 0 },
        },
      },
      {
        name: 'HeadOverlay',
        type: 'cube',
        box_uv: false,
        from: [-4.5, -0.5, -4.5],
        to: [4.5, 8.5, 4.5],
        origin: [0, 0, 0],
        uuid: overlayCubeUuid,
        color: 5,
        locked: false,
        visibility: true,
        faces: {
          north: { uv: [40, 8, 48, 16], texture: 0 },
          south: { uv: [56, 8, 64, 16], texture: 0 },
          west: { uv: [48, 8, 56, 16], texture: 0 },
          east: { uv: [32, 8, 40, 16], texture: 0 },
          up: { uv: [48, 8, 40, 0], texture: 0 },
          down: { uv: [48, 0, 56, 8], texture: 0 },
        },
      },
    ],
    outliner: [
      {
        name: 'head',
        type: 'group',
        origin: [0, 0, 0],
        color: 0,
        uuid: boneUuid,
        export: true,
        isOpen: true,
        locked: false,
        visibility: true,
        children: [headCubeUuid, overlayCubeUuid],
      },
    ],
  };
}

function buildReliefBBModel(skinImage: HTMLImageElement, heightmap: any) {
  const textureUuid = generateUUID();
  const headCubeUuid = generateUUID();
  const boneUuid = generateUUID();
  const overlayChildren: string[] = [];

  const base64Texture = getBase64Image(skinImage);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo crear el contexto 2D para BBModel.');
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(skinImage, 0, 0, 64, 64);
  const imgData = ctx.getImageData(0, 0, 64, 64);

  const THICKNESS = 0.5;
  const baseBoundary = 4.0;
  
  const offsets = heightmap?.offsets ?? {
    right: 4.0,
    left: 4.0,
    top: 4.0,
    bottom: 4.0,
    front: 4.0,
    back: 4.0,
  };

  const faceDefs = [
    { key: 'right',  startX: 48, startY: 8 },
    { key: 'left',   startX: 32, startY: 8 },
    { key: 'top',    startX: 40, startY: 0 },
    { key: 'bottom', startX: 48, startY: 0 },
    { key: 'front',  startX: 40, startY: 8 },
    { key: 'back',   startX: 56, startY: 8 },
  ] as const;

  // ─── Helper: adjacent boundary pixel
  function getBoundaryNeighbor(
    faceKey: string,
    row: number,
    col: number,
    localFaceIdx: number
  ): { face: string; row: number; col: number } | null {
    if (localFaceIdx === 0) { // +X local (right boundary)
      if (col < 7) return null;
      if (faceKey === 'front')  return { face: 'right',  row: row,     col: 0 };
      if (faceKey === 'back')   return { face: 'left',   row: row,     col: 0 };
      if (faceKey === 'right')  return { face: 'back',   row: row,     col: 0 };
      if (faceKey === 'left')   return { face: 'front',  row: row,     col: 0 };
      if (faceKey === 'top')    return { face: 'right',  row: 0,       col: 7 - row };
      if (faceKey === 'bottom') return { face: 'right',  row: 7,       col: row };
    }
    if (localFaceIdx === 1) { // -X local (left boundary)
      if (col > 0) return null;
      if (faceKey === 'front')  return { face: 'left',   row: row,     col: 7 };
      if (faceKey === 'back')   return { face: 'right',  row: row,     col: 7 };
      if (faceKey === 'right')  return { face: 'front',  row: row,     col: 7 };
      if (faceKey === 'left')   return { face: 'back',   row: row,     col: 7 };
      if (faceKey === 'top')    return { face: 'left',   row: 0,       col: row };
      if (faceKey === 'bottom') return { face: 'left',   row: 7,       col: 7 - row };
    }
    if (localFaceIdx === 2) { // +Y local (top boundary)
      if (row > 0) return null;
      if (faceKey === 'front')  return { face: 'top',    row: 7,       col: col };
      if (faceKey === 'back')   return { face: 'top',    row: 0,       col: 7 - col };
      if (faceKey === 'right')  return { face: 'top',    row: 7 - col, col: 7 };
      if (faceKey === 'left')   return { face: 'top',    row: col,     col: 0 };
      if (faceKey === 'top')    return { face: 'back',   row: 0,       col: 7 - col };
      if (faceKey === 'bottom') return { face: 'front',  row: 7,       col: col };
    }
    if (localFaceIdx === 3) { // -Y local (bottom boundary)
      if (row < 7) return null;
      if (faceKey === 'front')  return { face: 'bottom', row: 0,       col: col };
      if (faceKey === 'back')   return { face: 'bottom', row: 7,       col: 7 - col };
      if (faceKey === 'right')  return { face: 'bottom', row: col,     col: 7 };
      if (faceKey === 'left')   return { face: 'bottom', row: 7 - col, col: 0 };
      if (faceKey === 'top')    return { face: 'front',  row: 0,       col: col };
      if (faceKey === 'bottom') return { face: 'back',   row: 7,       col: 7 - col };
    }
    return null;
  }

  // ─── Pass 1: Build presence/offset mask
  type PixelInfo = { active: boolean; heightVal: number; pixelOffset: number };
  const overlayMask: Record<string, PixelInfo[][]> = {};

  for (const face of faceDefs) {
    const faceHeightmap = heightmap?.[face.key];
    const faceDefaultOffset = offsets[face.key as keyof typeof offsets] ?? 4.0;
    const faceMatrix: PixelInfo[][] = [];

    for (let row = 0; row < 8; row++) {
      const rowArr: PixelInfo[] = [];
      for (let col = 0; col < 8; col++) {
        const texRow = face.key === 'bottom' ? (7 - row) : row;
        const px = face.startX + col;
        const py = face.startY + texRow;
        const idx = (py * 64 + px) * 4;
        const alpha = imgData.data[idx + 3];

        if (alpha > 10) {
          let heightVal = faceHeightmap ? faceHeightmap[texRow]?.[col] ?? 1 : 1;
          if (heightVal === 0) heightVal = 1;
          const pixelOffset = (heightVal === 3 || heightVal === 4)
            ? faceDefaultOffset + 0.175
            : faceDefaultOffset;
          rowArr.push({ active: true, heightVal, pixelOffset });
        } else {
          rowArr.push({ active: false, heightVal: 0, pixelOffset: 0 });
        }
      }
      faceMatrix.push(rowArr);
    }
    overlayMask[face.key] = faceMatrix;
  }

  function isNeighborActive(neighbor: { face: string; row: number; col: number } | null): boolean {
    if (!neighbor) return false;
    return overlayMask[neighbor.face]?.[neighbor.row]?.[neighbor.col]?.active ?? false;
  }

  const elements: any[] = [
    {
      name: 'Head',
      type: 'cube',
      box_uv: false,
      from: [-4, 0, -4],
      to: [4, 8, 4],
      origin: [0, 0, 0],
      uuid: headCubeUuid,
      color: 0,
      locked: false,
      visibility: true,
      faces: {
        north: { uv: [8, 8, 16, 16], texture: 0 },
        south: { uv: [24, 8, 32, 16], texture: 0 },
        west: { uv: [16, 8, 24, 16], texture: 0 },
        east: { uv: [0, 8, 8, 16], texture: 0 },
        up: { uv: [16, 8, 8, 0], texture: 0 },
        down: { uv: [16, 0, 24, 8], texture: 0 },
      },
    },
  ];

  // ─── Pass 2: Generate elements matching HeadBuilder
  for (const face of faceDefs) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const info = overlayMask[face.key][row][col];
        if (!info.active) continue;

        const texRow = face.key === 'bottom' ? (7 - row) : row;
        const px = face.startX + col;
        const py = face.startY + texRow;

        // Boundary cap tracking for clipping
        const needsInnerCap = [false, false, false, false];
        for (let fi = 0; fi < 4; fi++) {
          let hasSameFaceNeighbor = false;
          if (fi === 0 && col < 7) {
            const nb = overlayMask[face.key][row][col + 1];
            if (nb?.active) {
              hasSameFaceNeighbor = true;
            }
          } else if (fi === 1 && col > 0) {
            const nb = overlayMask[face.key][row][col - 1];
            if (nb?.active) {
              hasSameFaceNeighbor = true;
            }
          } else if (fi === 2 && row > 0) {
            const nb = overlayMask[face.key][row - 1][col];
            if (nb?.active) {
              hasSameFaceNeighbor = true;
            }
          } else if (fi === 3 && row < 7) {
            const nb = overlayMask[face.key][row + 1][col];
            if (nb?.active) {
              hasSameFaceNeighbor = true;
            }
          }

          if (!hasSameFaceNeighbor) {
            const bNeighbor = getBoundaryNeighbor(face.key, row, col, fi);
            if (bNeighbor && !isNeighborActive(bNeighbor)) {
              needsInnerCap[fi] = true;
            }
          }
        }

        // Local coordinates
        let xMin = -4.5 + col * 1.125;
        let xMax = -4.5 + (col + 1) * 1.125;
        let yMin = 4.5 - (row + 1) * 1.125;
        let yMax = 4.5 - row * 1.125;

        // Clip edges to base boundary (±4.0) if adjacent face is inactive
        if (needsInnerCap[0]) xMax = Math.min(xMax,  baseBoundary);
        if (needsInnerCap[1]) xMin = Math.max(xMin, -baseBoundary);
        if (needsInnerCap[2]) yMax = Math.min(yMax,  baseBoundary);
        if (needsInnerCap[3]) yMin = Math.max(yMin, -baseBoundary);

        const w = xMax - xMin;
        const h = yMax - yMin;
        if (w <= 0 || h <= 0) continue;

        // Universal depth extension
        let outerZ = info.pixelOffset + THICKNESS;
        for (let fi2 = 0; fi2 < 4; fi2++) {
          const bNeighbor = getBoundaryNeighbor(face.key, row, col, fi2);
          if (!bNeighbor || !isNeighborActive(bNeighbor)) continue;
          const nbInfo2 = overlayMask[bNeighbor.face][bNeighbor.row][bNeighbor.col];
          const neighborOuterZ = nbInfo2.pixelOffset + THICKNESS;
          outerZ = Math.max(outerZ, 4.5, neighborOuterZ);
        }

        // Rotation transform mapping local to World (Three.js space)
        let worldX_min = 0, worldX_max = 0;
        let worldY_min = 0, worldY_max = 0;
        let worldZ_min = 0, worldZ_max = 0;

        if (face.key === 'right') {
          worldX_min = baseBoundary;
          worldX_max = outerZ;
          worldY_min = yMin;
          worldY_max = yMax;
          worldZ_min = -xMax;
          worldZ_max = -xMin;
        } else if (face.key === 'left') {
          worldX_min = -outerZ;
          worldX_max = -baseBoundary;
          worldY_min = yMin;
          worldY_max = yMax;
          worldZ_min = xMin;
          worldZ_max = xMax;
        } else if (face.key === 'top') {
          worldX_min = xMin;
          worldX_max = xMax;
          worldY_min = baseBoundary;
          worldY_max = outerZ;
          worldZ_min = yMin;
          worldZ_max = yMax;
        } else if (face.key === 'bottom') {
          worldX_min = xMin;
          worldX_max = xMax;
          worldY_min = -outerZ;
          worldY_max = -baseBoundary;
          worldZ_min = -yMax;
          worldZ_max = -yMin;
        } else if (face.key === 'front') {
          worldX_min = xMin;
          worldX_max = xMax;
          worldY_min = yMin;
          worldY_max = yMax;
          worldZ_min = baseBoundary;
          worldZ_max = outerZ;
        } else { // back
          worldX_min = -xMax;
          worldX_max = -xMin;
          worldY_min = yMin;
          worldY_max = yMax;
          worldZ_min = -outerZ;
          worldZ_max = -baseBoundary;
        }

        // Shift world coordinates Y by +4.0 to align in Blockbench [0, 8] space
        const fromX = worldX_min;
        const fromY = worldY_min + 4.0;
        const fromZ = worldZ_min;

        const toX = worldX_max;
        const toY = worldY_max + 4.0;
        const toZ = worldZ_max;

        const uuid = generateUUID();
        overlayChildren.push(uuid);

        elements.push({
          name: `overlay_${face.key}_${row}_${col}`,
          type: 'cube',
          box_uv: false,
          from: [fromX, fromY, fromZ],
          to: [toX, toY, toZ],
          origin: [0, 0, 0],
          uuid,
          color: 5,
          locked: false,
          visibility: true,
          faces: createSinglePixelFaces(px, py),
        });
      }
    }
  }

  return {
    meta: {
      format_version: '4.9',
      model_format: 'free',
      box_uv: false,
    },
    name: 'cabeza_minecraft_relieve',
    model_identifier: 'cabeza_minecraft_relieve',
    resolution: {
      width: 64,
      height: 64,
    },
    textures: [
      {
        name: 'skin',
        folder: 'textures',
        namespace: 'minecraft',
        id: '0',
        path: '',
        uuid: textureUuid,
        source: base64Texture,
      },
    ],
    elements,
    outliner: [
      {
        name: 'head',
        type: 'group',
        origin: [0, 0, 0],
        color: 0,
        uuid: boneUuid,
        export: true,
        isOpen: true,
        locked: false,
        visibility: true,
        children: [headCubeUuid, ...overlayChildren],
      },
    ],
  };
}

/**
 * Exports the Minecraft head (and overlay) as a .bbmodel JSON file.
 * 
 * @param skinImage The original uploaded 64x64 skin image element
 */
export function exportToBBModelClassic(skinImage: HTMLImageElement) {
  const jsonString = JSON.stringify(buildClassicBBModel(skinImage), null, 2);
  downloadBBModelFile(jsonString, 'skinbridge_cabeza.bbmodel');
}

export function exportToBBModelWithRelief(skinImage: HTMLImageElement, heightmap: any) {
  const jsonString = JSON.stringify(buildReliefBBModel(skinImage, heightmap), null, 2);
  downloadBBModelFile(jsonString, 'skinbridge_cabeza.bbmodel');
}

export function exportToBBModel(skinImage: HTMLImageElement, heightmap?: any) {
  if (heightmap) {
    exportToBBModelWithRelief(skinImage, heightmap);
    return;
  }

  exportToBBModelClassic(skinImage);
}
