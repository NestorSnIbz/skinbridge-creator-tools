import * as THREE from 'three';
import { dilateTexture } from './OBJExporter';

export interface BlockbenchTexture {
  id: string;
  uuid?: string;
  name: string;
  source: string; // Base64 data URL
  width: number;
  height: number;
  loadedImage?: HTMLImageElement;
  threeMaterial?: THREE.MeshStandardMaterial;
  imgData?: ImageData;
}

export interface ParsedBlockbenchModel {
  group: THREE.Group;
  textures: BlockbenchTexture[];
}

/**
 * Loads a base64 image string into an HTMLImageElement.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load embedded texture'));
    img.src = src;
  });
}

/**
 * Generates a default 64x64 grid texture to use as a fallback if no textures are provided.
 */
function generateFallbackTexture(): HTMLImageElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  
  // Grey checkerboard grid
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, 64, 64);
  
  ctx.fillStyle = '#27272a';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 0) {
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
    }
  }
  
  const img = new Image();
  img.src = canvas.toDataURL();
  return img;
}


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

  const indices = new Uint16Array(totalVertices);
  for (let i = 0; i < totalVertices; i++) {
    indices[i] = i;
  }
  mergedGeom.setIndex(new THREE.BufferAttribute(indices, 1));

  return mergedGeom;
}

function buildVoxelizedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  facesData: any,
  getTextureByRef: (ref: any) => BlockbenchTexture
): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];
  const faceVertexCounts = [0, 0, 0, 0, 0, 0];

  const faceDefs = [
    {
      key: 'east', idx: 0,
      buildQuad: (col: number, row: number, u: number, v: number, w_seg: number, h_seg: number) => {
        const segW = depth / w_seg;
        const segH = height / h_seg;
        const geom = buildPlaneGeometry(segW, segH, u, u, v, v);
        geom.rotateY(Math.PI / 2);
        const px = width / 2;
        const py = height / 2 - segH / 2 - row * segH;
        const pz = depth / 2 - segW / 2 - col * segW;
        geom.translate(px, py, pz);
        return geom;
      }
    },
    {
      key: 'west', idx: 1,
      buildQuad: (col: number, row: number, u: number, v: number, w_seg: number, h_seg: number) => {
        const segW = depth / w_seg;
        const segH = height / h_seg;
        const geom = buildPlaneGeometry(segW, segH, u, u, v, v);
        geom.rotateY(-Math.PI / 2);
        const px = -width / 2;
        const py = height / 2 - segH / 2 - row * segH;
        const pz = -depth / 2 + segW / 2 + col * segW;
        geom.translate(px, py, pz);
        return geom;
      }
    },
    {
      key: 'up', idx: 2,
      buildQuad: (col: number, row: number, u: number, v: number, w_seg: number, h_seg: number) => {
        const segW = width / w_seg;
        const segH = depth / h_seg;
        const geom = buildPlaneGeometry(segW, segH, u, u, v, v);
        geom.rotateX(-Math.PI / 2);
        const px = -width / 2 + segW / 2 + col * segW;
        const py = height / 2;
        const pz = -depth / 2 + segH / 2 + row * segH;
        geom.translate(px, py, pz);
        return geom;
      }
    },
    {
      key: 'down', idx: 3,
      buildQuad: (col: number, row: number, u: number, v: number, w_seg: number, h_seg: number) => {
        const segW = width / w_seg;
        const segH = depth / h_seg;
        const geom = buildPlaneGeometry(segW, segH, u, u, v, v);
        geom.rotateX(Math.PI / 2);
        const px = -width / 2 + segW / 2 + col * segW;
        const py = -height / 2;
        const pz = depth / 2 - segH / 2 - row * segH;
        geom.translate(px, py, pz);
        return geom;
      }
    },
    {
      key: 'south', idx: 4,
      buildQuad: (col: number, row: number, u: number, v: number, w_seg: number, h_seg: number) => {
        const segW = width / w_seg;
        const segH = height / h_seg;
        const geom = buildPlaneGeometry(segW, segH, u, u, v, v);
        const px = -width / 2 + segW / 2 + col * segW;
        const py = height / 2 - segH / 2 - row * segH;
        const pz = depth / 2;
        geom.translate(px, py, pz);
        return geom;
      }
    },
    {
      key: 'north', idx: 5,
      buildQuad: (col: number, row: number, u: number, v: number, w_seg: number, h_seg: number) => {
        const segW = width / w_seg;
        const segH = height / h_seg;
        const geom = buildPlaneGeometry(segW, segH, u, u, v, v);
        geom.rotateY(Math.PI);
        const px = width / 2 - segW / 2 - col * segW;
        const py = height / 2 - segH / 2 - row * segH;
        const pz = -depth / 2;
        geom.translate(px, py, pz);
        return geom;
      }
    }
  ];

  for (const fDef of faceDefs) {
    const fData = facesData ? facesData[fDef.key] : null;
    let texWidth = 64;
    let texHeight = 64;
    let hasTexture = false;

    if (fData && fData.texture !== undefined && fData.texture !== null) {
      const tex = getTextureByRef(fData.texture);
      texWidth = tex.width;
      texHeight = tex.height;
      hasTexture = true;
    }

    const uv = (fData && fData.uv) || [0, 0, 16, 16];
    const u1 = uv[0];
    const v1 = uv[1];
    const u2 = uv[2];
    const v2 = uv[3];

    const uMin = Math.min(u1, u2);
    const uMax = Math.max(u1, u2);
    const vMin = Math.min(v1, v2);
    const vMax = Math.max(v1, v2);

    const uv_w = Math.max(1, Math.round(uMax - uMin));
    const uv_h = Math.max(1, Math.round(vMax - vMin));

    const rot = (fData && fData.rotation) || 0;

    let w_seg = uv_w;
    let h_seg = uv_h;
    if (rot === 90 || rot === 270) {
      w_seg = uv_h;
      h_seg = uv_w;
    }

    for (let row = 0; row < h_seg; row++) {
      for (let col = 0; col < w_seg; col++) {
        // Calculate normalized face coordinates (0 to 1) for the center of the quad segment
        const f_u = (col + 0.5) / w_seg;
        const f_v = (row + 0.5) / h_seg;

        // Rotate face coordinates based on UV rotation
        let r_u = f_u;
        let r_v = f_v;
        if (rot === 90) {
          r_u = f_v;
          r_v = 1.0 - f_u;
        } else if (rot === 180) {
          r_u = 1.0 - f_u;
          r_v = 1.0 - f_v;
        } else if (rot === 270) {
          r_u = 1.0 - f_v;
          r_v = f_u;
        }

        // Map rotated face coordinates to texture pixel coordinates
        const px_u = u1 + r_u * (u2 - u1);
        const px_v = v1 + r_v * (v2 - v1);

        // Alpha check: skip transparent pixels (alpha < 10) to cut out geometry physically
        if (hasTexture) {
          const tex = getTextureByRef(fData.texture);
          if (tex && tex.imgData) {
            const px_x = Math.min(tex.width - 1, Math.max(0, Math.floor(px_u)));
            const px_y = Math.min(tex.height - 1, Math.max(0, Math.floor(px_v)));
            const pixelIdx = (px_y * tex.width + px_x) * 4;
            const alpha = tex.imgData.data[pixelIdx + 3];
            if (alpha < 10) {
              continue;
            }
          }
        }

        const uNorm = hasTexture ? px_u / texWidth : 0.5 / texWidth;
        const vNorm = hasTexture ? 1.0 - (px_v / texHeight) : 1.0 - (0.5 / texHeight);

        const quadGeom = fDef.buildQuad(col, row, uNorm, vNorm, w_seg, h_seg);
        geometries.push(quadGeom);
        faceVertexCounts[fDef.idx] += 6;
      }
    }
  }

  if (geometries.length === 0) {
    return new THREE.BufferGeometry();
  }

  const merged = mergeBufferGeometries(geometries);
  geometries.forEach(g => g.dispose());

  // Add groups for multi-material mapping
  let start = 0;
  for (let i = 0; i < 6; i++) {
    const count = faceVertexCounts[i];
    if (count > 0) {
      merged.addGroup(start, count, i);
      start += count;
    }
  }

  return merged;
}

/**
 * Scales an image up to 1024x1024 using Nearest-Neighbor interpolation on a canvas.
 */
function scaleImageTo1024(image: HTMLImageElement): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(image);
      return;
    }
    
    // Nearest-neighbor scaling settings
    ctx.imageSmoothingEnabled = false;
    (ctx as any).mozImageSmoothingEnabled = false;
    (ctx as any).webkitImageSmoothingEnabled = false;
    (ctx as any).msImageSmoothingEnabled = false;
    
    // Create temporary canvas to dilate texture at its original resolution first,
    // which is how the border/seam problem was solved in the head3d OBJ export.
    const tempCanvas = document.createElement('canvas');
    const w = image.naturalWidth || image.width || 64;
    const h = image.naturalHeight || image.height || 64;
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.drawImage(image, 0, 0);
      try {
        const imgData = tempCtx.getImageData(0, 0, w, h);
        const dilatedData = dilateTexture(imgData);
        tempCtx.putImageData(dilatedData, 0, 0);
        
        // Draw dilated texture scaled up to 1024x1024 using nearest-neighbor
        ctx.drawImage(tempCanvas, 0, 0, w, h, 0, 0, 1024, 1024);
      } catch (e) {
        console.warn('Failed to dilate texture, falling back to simple scale:', e);
        ctx.drawImage(image, 0, 0, w, h, 0, 0, 1024, 1024);
      }
    } else {
      ctx.drawImage(image, 0, 0, w, h, 0, 0, 1024, 1024);
    }
    
    const scaledImg = new Image();
    scaledImg.onload = () => resolve(scaledImg);
    scaledImg.onerror = () => resolve(image); // Fallback to original if load fails
    scaledImg.src = canvas.toDataURL('image/png');
  });
}

/**
 * Parses the raw .bbmodel JSON and builds the corresponding 3D meshes.
 */
export async function parseBlockbenchModel(jsonText: string): Promise<ParsedBlockbenchModel> {
  const data = JSON.parse(jsonText);
  
  if (!data.elements || !Array.isArray(data.elements)) {
    throw new Error('Invalid .bbmodel structure: elements array is missing.');
  }

  const modelGroup = new THREE.Group();
  modelGroup.name = 'BlockbenchModel';

  // 1. Parse and Load Textures
  const parsedTextures: BlockbenchTexture[] = [];
  const rawTextures = data.textures || [];
  
  for (const tex of rawTextures) {
    let img: HTMLImageElement;
    if (tex.source && tex.source.startsWith('data:')) {
      try {
        img = await loadImage(tex.source);
      } catch (err) {
        console.warn('Failed to load embedded texture:', tex.name, err);
        img = generateFallbackTexture();
      }
    } else {
      img = generateFallbackTexture();
    }

    // Extract original image pixel data
    const tempCanvas = document.createElement('canvas');
    const w = img.naturalWidth || img.width || 64;
    const h = img.naturalHeight || img.height || 64;
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.drawImage(img, 0, 0);
    const imgData = tempCtx.getImageData(0, 0, w, h);

    // Scale up to 1024x1024 to make Roblox Studio render it sharp
    const scaledImg = await scaleImageTo1024(img);

    // Create a WebGL Texture
    const texture = new THREE.Texture(scaledImg);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.name = tex.name || 'texture.png';
    (texture as any).sourceFile = tex.name || 'texture.png';
    texture.needsUpdate = true;

    // Standard material referencing this texture
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.6,
      metalness: 0.1,
      transparent: true,
      side: THREE.DoubleSide
    });
    material.name = `mat_${tex.name || tex.id}`;

    parsedTextures.push({
      id: String(tex.id),
      uuid: tex.uuid,
      name: tex.name || 'texture.png',
      source: tex.source || '',
      width: w,
      height: h,
      loadedImage: scaledImg,
      threeMaterial: material,
      imgData: imgData
    });
  }

  // Fallback if no textures exist in the file
  if (parsedTextures.length === 0) {
    const fallbackImg = generateFallbackTexture();
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 64;
    tempCanvas.height = 64;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.drawImage(fallbackImg, 0, 0);
    const imgData = tempCtx.getImageData(0, 0, 64, 64);

    const scaledFallbackImg = await scaleImageTo1024(fallbackImg);
    const texture = new THREE.Texture(scaledFallbackImg);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.name = 'fallback.png';
    texture.needsUpdate = true;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.6,
      metalness: 0.1,
      transparent: true,
      side: THREE.DoubleSide
    });
    material.name = 'mat_fallback';

    parsedTextures.push({
      id: 'fallback',
      name: 'fallback.png',
      source: '',
      width: 64,
      height: 64,
      loadedImage: scaledFallbackImg,
      threeMaterial: material,
      imgData: imgData
    });
  }

  // Shared transparent material for faces that have no texture assigned
  const transparentMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  transparentMaterial.name = 'mat_transparent';

  // Helper to map Blockbench texture ref to parsed texture
  const getTextureByRef = (ref: any): BlockbenchTexture => {
    if (ref === undefined || ref === null) return parsedTextures[0];
    const refStr = String(ref).replace('#', '');
    const found = parsedTextures.find(t => t.id === refStr || t.uuid === refStr);
    return found || parsedTextures[0];
  };

  // 2. Parse Elements
  for (let i = 0; i < data.elements.length; i++) {
    const el = data.elements[i];

    // Skip hidden elements (helps exclude toggled/hidden editor states)
    if (el.visibility === false) {
      continue;
    }

    // Skip locators/cameras/helpers that don't have any textured faces
    let hasTexturedFace = false;
    const faceOrderCheck = ['east', 'west', 'up', 'down', 'south', 'north'];
    if (el.faces) {
      for (const faceKey of faceOrderCheck) {
        const faceData = el.faces[faceKey];
        if (faceData && faceData.texture !== undefined && faceData.texture !== null) {
          hasTexturedFace = true;
          break;
        }
      }
    }
    if (!hasTexturedFace) {
      continue;
    }

    const from = el.from || [0, 0, 0];
    const to = el.to || [1, 1, 1];
    const origin = el.origin || [0, 0, 0];
    const rotation = el.rotation || [0, 0, 0];

    // Compute dimensions
    const width = Math.abs(to[0] - from[0]);
    const height = Math.abs(to[1] - from[1]);
    const depth = Math.abs(to[2] - from[2]);

    const geometry = buildVoxelizedBoxGeometry(width, height, depth, el.faces, getTextureByRef);

    // Blockbench coordinates: center is mid-point
    const centerX = (from[0] + to[0]) / 2;
    const centerY = (from[1] + to[1]) / 2;
    const centerZ = (from[2] + to[2]) / 2;

    // Define 6 face materials in standard Three.js order:
    // +X (East), -X (West), +Y (Up), -Y (Down), +Z (South), -Z (North)
    const faceOrder = [
      { key: 'east', idx: 0 },
      { key: 'west', idx: 1 },
      { key: 'up', idx: 2 },
      { key: 'down', idx: 3 },
      { key: 'south', idx: 4 },
      { key: 'north', idx: 5 }
    ];

    const materials: THREE.Material[] = [];

    for (const faceInfo of faceOrder) {
      const faceData = el.faces ? el.faces[faceInfo.key] : null;
      if (faceData && faceData.texture !== undefined && faceData.texture !== null) {
        const tex = getTextureByRef(faceData.texture);
        materials.push(tex.threeMaterial || parsedTextures[0].threeMaterial!);
      } else {
        materials.push(transparentMaterial);
      }
    }

    // Create mesh
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.name = el.name || `cube_${i}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Set position relative to rotation pivot (origin)
    mesh.position.set(
      centerX - origin[0],
      centerY - origin[1],
      centerZ - origin[2]
    );

    // Create rotation pivot group
    const pivot = new THREE.Group();
    pivot.name = `pivot_${el.name || i}`;
    pivot.position.set(origin[0], origin[1], origin[2]);
    pivot.add(mesh);

    // Apply rotation (Euler degrees converted to radians)
    // Blockbench rotation order is ZXY (Minecraft standard)
    pivot.rotation.order = 'ZXY';
    pivot.rotation.set(
      THREE.MathUtils.degToRad(rotation[0]),
      THREE.MathUtils.degToRad(rotation[1]),
      THREE.MathUtils.degToRad(rotation[2])
    );

    modelGroup.add(pivot);
  }

  // Center model globally around (0,0,0) by calculating bounding box
  const bbox = new THREE.Box3().setFromObject(modelGroup);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  
  // Offset all top-level pivots so the model geometry centers nicely at origin
  modelGroup.children.forEach((child) => {
    child.position.sub(center);
  });

  return {
    group: modelGroup,
    textures: parsedTextures
  };
}
