import * as THREE from 'three';
import { OBJExporter as ThreeOBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';

/**
 * Downloads text content as a file in the browser.
 */
function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.style.display = 'none';
  document.body.appendChild(link);
  
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Expands (dilates) the borders of opaque pixels in the texture into the transparent regions.
 * This completely eliminates the black outline (alpha bleeding) caused by bilinear filtering in Roblox Studio.
 */
function dilateTexture(imgData: ImageData): ImageData {
  const width = imgData.width;
  const height = imgData.height;
  const data = imgData.data;
  
  // Perform 4 iterations of pixel dilation to cover filtering margin
  for (let iter = 0; iter < 4; iter++) {
    const nextData = new Uint8ClampedArray(data);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        // If current pixel is transparent
        if (data[idx + 3] < 10) {
          // Check 4-neighborhood neighbors
          const neighbors = [
            { x: x + 1, y: y },
            { x: x - 1, y: y },
            { x: x, y: y + 1 },
            { x: x, y: y - 1 }
          ];
          for (const n of neighbors) {
            if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
              const nIdx = (n.y * width + n.x) * 4;
              // If neighbor is opaque, copy its color
              if (data[nIdx + 3] >= 10) {
                nextData[idx] = data[nIdx];
                nextData[idx + 1] = data[nIdx + 1];
                nextData[idx + 2] = data[nIdx + 2];
                nextData[idx + 3] = 255; // Set opaque to prevent alpha blending issues
                break;
              }
            }
          }
        }
      }
    }
    data.set(nextData);
  }
  return imgData;
}

/**
 * Downloads the skin image as a PNG file (textura.png).
 * Scales it to 1024x1024 for high-definition rendering in Roblox Studio.
 * Applies dilation to fix black outline rendering issues.
 */
function downloadSkinImage(image: HTMLImageElement, filename: string): Promise<void> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(); return; }
    
    // Draw original image on a 64x64 temporary canvas to apply pixel dilation
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 64;
    tempCanvas.height = 64;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.drawImage(image, 0, 0);
    
    const imgData = tempCtx.getImageData(0, 0, 64, 64);
    const dilatedData = dilateTexture(imgData);
    tempCtx.putImageData(dilatedData, 0, 0);
    
    // Scale the dilated 64x64 texture to 1024x1024 using NEAREST NEIGHBOR interpolation
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, 64, 64, 0, 0, 1024, 1024);
    
    canvas.toBlob((blob) => {
      if (!blob) { resolve(); return; }
      const link = document.createElement('a');
      link.style.display = 'none';
      document.body.appendChild(link);
      
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      resolve();
    }, 'image/png');
  });
}

/**
 * Helper to build custom PlaneGeometry for a single voxel face with UV coordinates mapping to a single pixel.
 * Converts to non-indexed geometry so it can be merged directly.
 */
function buildPlaneGeometry(
  w: number,
  h: number,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number
): THREE.BufferGeometry {
  const geom = new THREE.PlaneGeometry(w, h);
  const uvAttr = geom.attributes.uv as THREE.BufferAttribute;
  uvAttr.setXY(0, uMin, vMax);
  uvAttr.setXY(1, uMax, vMax);
  uvAttr.setXY(2, uMin, vMin);
  uvAttr.setXY(3, uMax, vMin);
  uvAttr.needsUpdate = true;
  
  const nonIndexed = geom.toNonIndexed();
  geom.dispose();
  return nonIndexed;
}

/**
 * Merges multiple BufferGeometries (non-indexed) into a single BufferGeometry.
 */
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const mergedGeom = new THREE.BufferGeometry();

  let totalVertices = 0;
  geometries.forEach((g) => {
    totalVertices += g.attributes.position.count;
  });

  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);

  let vertexOffset = 0;
  geometries.forEach((g) => {
    const posAttr = g.attributes.position;
    const normAttr = g.attributes.normal;
    const uvAttr = g.attributes.uv;

    const count = posAttr.count;

    for (let i = 0; i < count; i++) {
      positions[(vertexOffset + i) * 3] = posAttr.getX(i);
      positions[(vertexOffset + i) * 3 + 1] = posAttr.getY(i);
      positions[(vertexOffset + i) * 3 + 2] = posAttr.getZ(i);

      normals[(vertexOffset + i) * 3] = normAttr.getX(i);
      normals[(vertexOffset + i) * 3 + 1] = normAttr.getY(i);
      normals[(vertexOffset + i) * 3 + 2] = normAttr.getZ(i);

      uvs[(vertexOffset + i) * 2] = uvAttr.getX(i);
      uvs[(vertexOffset + i) * 2 + 1] = uvAttr.getY(i);
    }

    vertexOffset += count;
  });

  mergedGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  mergedGeom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  mergedGeom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  return mergedGeom;
}

/**
 * Builds a 3D group of flat planes representing only the non-transparent pixels in the skin's overlay layer.
 * Merges all planes into a single consolidated mesh named 'HeadOverlay' to preserve 3D relief in Roblox Studio.
 */
function buildVoxelizedOverlay(skinImage: HTMLImageElement): THREE.Group {
  const group = new THREE.Group();
  group.name = 'HeadOverlayVoxelized';

  // Read skin pixels
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(skinImage, 0, 0);
  const imgData = ctx.getImageData(0, 0, 64, 64);

  const size = 1.125;

  const faces = [
    { // Face 0 (Right, +X)
      faceIndex: 0,
      startX: 48, startY: 8,
      getPos: (col: number, row: number) => ({
        x: 4.5,
        y: 4.5 - (row + 0.5) * size,
        z: -4.5 + (col + 0.5) * size
      })
    },
    { // Face 1 (Left, -X)
      faceIndex: 1,
      startX: 32, startY: 8,
      getPos: (col: number, row: number) => ({
        x: -4.5,
        y: 4.5 - (row + 0.5) * size,
        z: 4.5 - (col + 0.5) * size
      })
    },
    { // Face 2 (Top, +Y)
      faceIndex: 2,
      startX: 40, startY: 0,
      getPos: (col: number, row: number) => ({
        x: 4.5 - (col + 0.5) * size,
        y: 4.5,
        z: -4.5 + (row + 0.5) * size
      })
    },
    { // Face 3 (Bottom, -Y)
      faceIndex: 3,
      startX: 48, startY: 0,
      getPos: (col: number, row: number) => ({
        x: 4.5 - (col + 0.5) * size,
        y: -4.5,
        z: 4.5 - (row + 0.5) * size
      })
    },
    { // Face 4 (Front, +Z)
      faceIndex: 4,
      startX: 40, startY: 8,
      getPos: (col: number, row: number) => ({
        x: 4.5 - (col + 0.5) * size,
        y: 4.5 - (row + 0.5) * size,
        z: 4.5
      })
    },
    { // Face 5 (Back, -Z)
      faceIndex: 5,
      startX: 56, startY: 8,
      getPos: (col: number, row: number) => ({
        x: -4.5 + (col + 0.5) * size,
        y: 4.5 - (row + 0.5) * size,
        z: -4.5
      })
    }
  ];

  const geometries: THREE.BufferGeometry[] = [];

  faces.forEach((face) => {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const px = face.startX + col;
        const py = face.startY + row;
        const idx = (py * 64 + px) * 4;
        const alpha = imgData.data[idx + 3];

        // Only build geometry if pixel is opaque
        if (alpha > 10) {
          const uMin = px / 64;
          const uMax = (px + 1) / 64;
          const vMin = (64 - (py + 1)) / 64;
          const vMax = (64 - py) / 64;

          const geom = buildPlaneGeometry(size, size, uMin, uMax, vMin, vMax);

          // Apply rotation based on face index
          if (face.faceIndex === 0) {
            geom.rotateY(Math.PI / 2); // Right (+X)
          } else if (face.faceIndex === 1) {
            geom.rotateY(-Math.PI / 2); // Left (-X)
          } else if (face.faceIndex === 2) {
            geom.rotateX(-Math.PI / 2); // Top (+Y)
          } else if (face.faceIndex === 3) {
            geom.rotateX(Math.PI / 2); // Bottom (-Y)
          } else if (face.faceIndex === 4) {
            // Front (+Z) - no rotation needed
          } else if (face.faceIndex === 5) {
            geom.rotateY(Math.PI); // Back (-Z)
          }

          const pos = face.getPos(col, row);
          geom.translate(pos.x, pos.y, pos.z);
          geometries.push(geom);
        }
      }
    }
  });

  // Share a single material for the overlay (render double-sided so backfaces are optionally textured)
  const voxelMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide
  });

  if (geometries.length > 0) {
    const mergedGeom = mergeBufferGeometries(geometries);
    
    // Dispose of all temporary geometries
    geometries.forEach((g) => g.dispose());
    
    const mesh = new THREE.Mesh(mergedGeom, voxelMaterial);
    mesh.name = 'HeadOverlay';
    group.add(mesh);
  }

  return group;
}

/**
 * Exports the Three.js head model to OBJ + MTL + PNG format.
 * Voxelizes the overlay layer as flat quads (like Minecraft) to ensure correct transparency and look in Roblox.
 */
export function exportToOBJ(input: THREE.Object3D, skinImage: HTMLImageElement): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Create a temporary export group
      const exportGroup = new THREE.Group();
      exportGroup.name = 'MinecraftHead';

      // 1. Add the base head mesh clone
      const originalHead = input.getObjectByName('Head');
      if (originalHead && originalHead instanceof THREE.Mesh) {
        const headClone = originalHead.clone();
        headClone.name = 'Head';
        // Assign proper material name
        if (Array.isArray(headClone.material)) {
          headClone.material = headClone.material.map((m) => {
            if (m) {
              const mc = m.clone();
              mc.name = 'HeadMaterial';
              return mc;
            }
            return m;
          });
        } else if (headClone.material) {
          headClone.material = headClone.material.clone();
          headClone.material.name = 'HeadMaterial';
        }
        exportGroup.add(headClone);
      }

      // 2. Add the voxelized overlay (flat planes)
      const voxelizedOverlay = buildVoxelizedOverlay(skinImage);
      voxelizedOverlay.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.material) {
            child.material.name = 'OverlayMaterial';
          }
        }
      });
      exportGroup.add(voxelizedOverlay);

      const exporter = new ThreeOBJExporter();
      const rawObj = exporter.parse(exportGroup);
      
      // Prepend the mtllib reference so importers can find cabeza.mtl
      const objText = `mtllib cabeza.mtl\n${rawObj}`;
      
      // Generate MTL content with proper material definitions
      const mtlText = `# Minecraft Head - Material Template Library
# Generated by Minecraft 3D Head Creator

newmtl HeadMaterial
Ka 1.000 1.000 1.000
Kd 1.000 1.000 1.000
Ks 0.000 0.000 0.000
Ns 10.000
d 1.000
illum 2
map_Kd textura.png

newmtl OverlayMaterial
Ka 1.000 1.000 1.000
Kd 1.000 1.000 1.000
Ks 0.000 0.000 0.000
Ns 10.000
d 1.000
illum 2
map_Kd textura.png
`;

      // Download all three files with small delays to avoid browser blocking
      downloadTextFile(objText, 'cabeza.obj', 'text/plain');
      
      setTimeout(() => {
        downloadTextFile(mtlText, 'cabeza.mtl', 'text/plain');
      }, 200);

      setTimeout(async () => {
        await downloadSkinImage(skinImage, 'textura.png');
        resolve();
      }, 400);

    } catch (error) {
      reject(error);
    }
  });
}
