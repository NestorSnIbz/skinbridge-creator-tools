import * as THREE from 'three';
import { exportFbx } from 'three-js-fbx-exporter';

/**
 * Downloads a binary buffer as a file in the browser.
 */
function downloadBinaryFile(data: Uint8Array, filename: string) {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
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
 * Exports the Three.js head model to a binary FBX file.
 *
 * Uses `three-js-fbx-exporter` which generates a real, standards-compliant
 * binary FBX 7400 file directly in the browser. The exported file preserves:
 * - Mesh hierarchy (Head + HeadOverlay as separate objects)
 * - UV coordinates
 * - Materials with PBR-to-FBX adaptation
 * - Embedded textures
 *
 * Compatible with Blender, Maya, 3ds Max, and other professional DCC tools.
 *
 * @param input The THREE.Object3D (head group) to export
 * @param skinImage The HTMLImageElement containing the skin (used for texture embedding)
 */
export function exportToFBX(input: THREE.Object3D, skinImage: HTMLImageElement): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Prepare the skin texture as a 256x256 Nearest-Neighbor scaled data URL for embedding
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo crear el contexto 2D para la textura.'));
        return;
      }
      // Disable bilinear/trilinear filtering to use Nearest Neighbor
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(skinImage, 0, 0, 64, 64, 0, 0, 256, 256);
      const skinDataUrl = canvas.toDataURL('image/png');

      // Clone the entire input group to prevent mutating the original ThreeViewer scene/textures
      const clonedInput = input.clone();
      clonedInput.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Clone materials so we don't modify the shared material references
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material = child.material.map(m => m.clone());
            } else {
              child.material = child.material.clone();
            }
          }
          
          const mat = child.material;
          const materials = Array.isArray(mat) ? mat : [mat];
          
          materials.forEach((m) => {
            if (m && m.map) {
              // Clone the texture map so we don't modify the shared texture instance
              m.map = m.map.clone();
              
              // Set nearest neighbor interpolation on the material texture map
              m.map.minFilter = THREE.NearestFilter;
              m.map.magFilter = THREE.NearestFilter;
              m.map.generateMipmaps = false;
              
              // Set the image source as the scaled base64 data URL so exporter can embed it
              const img = new Image();
              img.src = skinDataUrl;
              m.map.image = img;
              m.map.sourceFile = 'textura.png';
            }
          });
        }
      });

      // Export the cloned model to binary FBX with Blender-compatible settings
      const fbxBytes = exportFbx(clonedInput, {
        format: 'binary',
        target: 'blender',
        embedTextures: true,
        onWarning: (warning) => {
          console.warn('[FBX Export Warning]', warning.message || warning.code);
        },
      });

      downloadBinaryFile(fbxBytes, 'cabeza.fbx');
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}
