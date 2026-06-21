import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { 
  Pencil, 
  Eraser, 
  Pipette, 
  Paintbrush, 
  Undo, 
  Redo, 
  Layers, 
  Eye, 
  Trash2, 
  Grid,
  Sparkles,
  RotateCw,
  Upload,
  Download
} from 'lucide-react';
import { useTranslation } from '../modules/i18n';
import { ThreeViewer } from '../modules/ThreeViewer';
import { buildRobloxAvatar, updateRobloxAvatarTextures } from '../modules/RobloxAvatarBuilder';
import { isSlimSkin, exportRobloxShirt, exportRobloxPants } from '../modules/RobloxClothingExporter';

// 64x64 Minecraft Skin Layout boundaries for guide outlines
export const MC_BOUNDS = {
  head: [
    { name: 'Head Top', x: 8, y: 0, w: 8, h: 8 },
    { name: 'Head Bottom', x: 16, y: 0, w: 8, h: 8 },
    { name: 'Head Front', x: 8, y: 8, w: 8, h: 8 },
    { name: 'Head Back', x: 24, y: 8, w: 8, h: 8 },
    { name: 'Head Right', x: 0, y: 8, w: 8, h: 8 },
    { name: 'Head Left', x: 16, y: 8, w: 8, h: 8 },
  ],
  torso: [
    { name: 'Torso Top', x: 20, y: 16, w: 8, h: 4 },
    { name: 'Torso Bottom', x: 28, y: 16, w: 8, h: 4 },
    { name: 'Torso Front', x: 20, y: 20, w: 8, h: 12 },
    { name: 'Torso Back', x: 32, y: 20, w: 8, h: 12 },
    { name: 'Torso Right', x: 16, y: 20, w: 4, h: 12 },
    { name: 'Torso Left', x: 28, y: 20, w: 4, h: 12 },
  ],
  rightArm: [
    { name: 'R Arm Top', x: 44, y: 16, w: 4, h: 4 },
    { name: 'R Arm Bottom', x: 48, y: 16, w: 4, h: 4 },
    { name: 'R Arm Front', x: 44, y: 20, w: 4, h: 12 },
    { name: 'R Arm Back', x: 52, y: 20, w: 4, h: 12 },
    { name: 'R Arm Right', x: 40, y: 20, w: 4, h: 12 },
    { name: 'R Arm Left', x: 48, y: 20, w: 4, h: 12 },
  ],
  leftArm: [
    { name: 'L Arm Top', x: 36, y: 48, w: 4, h: 4 },
    { name: 'L Arm Bottom', x: 40, y: 48, w: 4, h: 4 },
    { name: 'L Arm Front', x: 36, y: 52, w: 4, h: 12 },
    { name: 'L Arm Back', x: 44, y: 52, w: 4, h: 12 },
    { name: 'L Arm Right', x: 32, y: 52, w: 4, h: 12 },
    { name: 'L Arm Left', x: 40, y: 52, w: 4, h: 12 },
  ],
  rightLeg: [
    { name: 'R Leg Top', x: 4, y: 16, w: 4, h: 4 },
    { name: 'R Leg Bottom', x: 8, y: 16, w: 4, h: 4 },
    { name: 'R Leg Front', x: 4, y: 20, w: 4, h: 12 },
    { name: 'R Leg Back', x: 12, y: 20, w: 4, h: 12 },
    { name: 'R Leg Right', x: 0, y: 20, w: 4, h: 12 },
    { name: 'R Leg Left', x: 8, y: 20, w: 4, h: 12 },
  ],
  leftLeg: [
    { name: 'L Leg Top', x: 20, y: 48, w: 4, h: 4 },
    { name: 'L Leg Bottom', x: 24, y: 48, w: 4, h: 4 },
    { name: 'L Leg Front', x: 20, y: 52, w: 4, h: 12 },
    { name: 'L Leg Back', x: 28, y: 52, w: 4, h: 12 },
    { name: 'L Leg Right', x: 16, y: 52, w: 4, h: 12 },
    { name: 'L Leg Left', x: 24, y: 52, w: 4, h: 12 },
  ]
};

// Overlay coordinates
export const MC_OVERLAY_BOUNDS = {
  head: MC_BOUNDS.head.map(b => ({ ...b, x: b.x + 32 })),
  torso: MC_BOUNDS.torso.map(b => ({ ...b, y: b.y + 16 })),
  rightArm: MC_BOUNDS.rightArm.map(b => ({ ...b, y: b.y + 16 })),
  leftArm: MC_BOUNDS.leftArm.map(b => {
    const dx = 52 - 36;
    return { ...b, x: b.x + dx };
  }),
  rightLeg: MC_BOUNDS.rightLeg.map(b => ({ ...b, y: b.y + 16 })),
  leftLeg: MC_BOUNDS.leftLeg.map(b => {
    const dx = 4 - 20;
    return { ...b, x: b.x + dx };
  })
};

// Maps 3D part and face to Minecraft skin coordinates
export const getMinecraftRect = (
  meshName: string,
  faceName: string,
  layer: 'base' | 'overlay',
  armType: 'classic' | 'slim'
) => {
  const bounds = layer === 'base' ? MC_BOUNDS : MC_OVERLAY_BOUNDS;
  // Normalize mesh name
  let key = meshName;
  if (meshName === 'torsoMeshShirt' || meshName === 'torsoMeshPants') {
    key = 'torso';
  }
  const partRects = bounds[key as keyof typeof bounds];
  if (!partRects) return null;
  const matchName = faceName.toLowerCase();
  const rect = partRects.find(r => r.name.toLowerCase().endsWith(matchName));
  if (!rect) return null;

  // Clone rect to avoid mutating the original
  const result = { ...rect };

  // Adjust for Slim/Alex arm widths and shifts
  if (armType === 'slim' && (key === 'rightArm' || key === 'leftArm')) {
    if (matchName === 'front' || matchName === 'back' || matchName === 'top' || matchName === 'bottom') {
      result.w = 3;
    }
    // Shifts: Left, Back and Bottom faces shift left by 1 pixel because Front is 3px instead of 4px
    if (matchName === 'left' || matchName === 'bottom' || matchName === 'back') {
      result.x -= 1;
    }
  }

  return result;
};

const COLOR_PALETTE = [
  '#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#8b00ff', '#ff00ff',
  '#ffffff', '#c0c0c0', '#808080', '#000000', '#8b4513', '#d2b48c', '#ffe4c4', '#ffdab9'
];

export interface SkinEditorWorkspaceProps {
  skinImage: HTMLImageElement | null;
  onSkinChange: (newSrc: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  dragActive: boolean;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  triggerUploadClick: () => void;
  showToast: (type: 'success' | 'error', message: string) => void;
}

export default function SkinEditorWorkspace({
  skinImage,
  onSkinChange,
  fileInputRef,
  handleFileChange,
  dragActive,
  handleDrag,
  handleDrop,
  triggerUploadClick,
  showToast
}: SkinEditorWorkspaceProps) {
  const { t } = useTranslation();

  // Local editor tool state
  const [editorTool, setEditorTool] = useState<'pencil' | 'eraser' | 'bucket' | 'picker'>('pencil');
  const [editorLayer, setEditorLayer] = useState<'base' | 'overlay'>('base');
  const [editorColor, setEditorColor] = useState<string>('#ff0000');
  const [editorMirror, setEditorMirror] = useState<boolean>(false);
  const [armType, setArmType] = useState<'classic' | 'slim'>('classic');

  // Body part visibility state
  const [visibleParts, setVisibleParts] = useState({
    head: true,
    torso: true,
    rightArm: true,
    leftArm: true,
    rightLeg: true,
    leftLeg: true
  });

  // Option states
  const [showGuide, setShowGuide] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [show3DGrid, setShow3DGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);

  const viewerRef = useRef<ThreeViewer | null>(null);
  const avatarGroupRef = useRef<THREE.Group | null>(null);
  const isDrawing = useRef(false);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);

  // Undo/Redo stacks
  const historyStack = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const lastSavedDataUrlRef = useRef<string>('');

  // Sync state variables to refs to avoid closure bugs in the mount callback listener
  const armTypeRef = useRef(armType);
  const editorToolRef = useRef(editorTool);
  const editorColorRef = useRef(editorColor);
  const editorMirrorRef = useRef(editorMirror);
  const editorLayerRef = useRef(editorLayer);
  const visiblePartsRef = useRef(visibleParts);

  armTypeRef.current = armType;
  editorToolRef.current = editorTool;
  editorColorRef.current = editorColor;
  editorMirrorRef.current = editorMirror;
  editorLayerRef.current = editorLayer;
  visiblePartsRef.current = visibleParts;

  // Apply visibilities to ThreeViewer meshes
  const applyPartVisibilities = (viewer: ThreeViewer) => {
    Object.entries(visibleParts).forEach(([partName, visible]) => {
      viewer.setPartVisibility(partName, visible);
    });
  };

  // 1. Handle skinImage prop loaded externally (or uploaded)
  useEffect(() => {
    if (!skinImage || !canvasRef.current) return;

    // Avoid loops from our own internal updates
    if (skinImage.src === lastSavedDataUrlRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 64, 64);
    ctx.drawImage(skinImage, 0, 0, 64, 64);

    const dataUrl = canvas.toDataURL();
    historyStack.current = [dataUrl];
    historyIndex.current = 0;
    lastSavedDataUrlRef.current = dataUrl;

    const detectedIsSlim = isSlimSkin(skinImage);
    setArmType(detectedIsSlim ? 'slim' : 'classic');

    // Rebuild 3D model
    if (viewerRef.current) {
      const avatarGroup = buildRobloxAvatar(skinImage, detectedIsSlim);
      viewerRef.current.setHeadModel(avatarGroup);
      avatarGroupRef.current = avatarGroup;
      applyPartVisibilities(viewerRef.current);
    }
  }, [skinImage]);

  // 2. Initialize ThreeViewer local instance on mount
  useEffect(() => {
    if (!viewerContainerRef.current) return;

    const viewer = new ThreeViewer(viewerContainerRef.current);
    viewerRef.current = viewer;
    viewer.setGridY(-2.2);
    viewer.resetCamera(new THREE.Vector3(0, 1.2, 7), new THREE.Vector3(0, 1.2, 0));
    viewer.setGridVisible(show3DGrid);
    viewer.autoRotate = autoRotate;

    // Load initial model if skinImage is loaded
    if (skinImage && canvasRef.current) {
      const avatarGroup = buildRobloxAvatar(canvasRef.current, armType === 'slim');
      viewer.setHeadModel(avatarGroup);
      avatarGroupRef.current = avatarGroup;
      applyPartVisibilities(viewer);
    }

    // Set 3D paint callback
    viewer.enablePainting(
      (meshName, materialIndex, uv) => {
        handle3DPaint(meshName, materialIndex, uv);
      },
      () => {
        handlePaintEnd();
      }
    );

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
        avatarGroupRef.current = null;
      }
    };
  }, []); // Run once on mount

  // 3. Update 3D options in-place when toggled
  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.setGridVisible(show3DGrid);
    }
  }, [show3DGrid]);

  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // 4. Update mesh visibility when state changes
  useEffect(() => {
    if (viewerRef.current) {
      applyPartVisibilities(viewerRef.current);
    }
  }, [visibleParts]);

  // 5. Re-draw guide lines when 2D overlays change
  useEffect(() => {
    drawGuideOverlay();
  }, [showGuide, editorLayer, armType]);

  const drawGuideOverlay = () => {
    if (!overlayCanvasRef.current) return;
    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 512);

    if (!showGuide) return;

    ctx.lineWidth = 1;
    const scale = 512 / 64; // scale to canvas size
    const bounds = editorLayer === 'base' ? MC_BOUNDS : MC_OVERLAY_BOUNDS;

    const drawGroup = (groupName: string, color: string) => {
      ctx.strokeStyle = color;
      const partRects = bounds[groupName as keyof typeof bounds];
      if (!partRects) return;
      partRects.forEach(rect => {
        const matchName = rect.name.split(' ').pop()!.toLowerCase();
        const adj = getMinecraftRect(groupName, matchName, editorLayer, armType);
        if (adj) {
          ctx.strokeRect(adj.x * scale, adj.y * scale, adj.w * scale, adj.h * scale);
        }
      });
    };

    drawGroup('head', 'rgba(168, 85, 247, 0.6)'); // Purple Head
    drawGroup('torso', 'rgba(99, 102, 241, 0.6)'); // Indigo Torso
    drawGroup('rightArm', 'rgba(239, 68, 68, 0.6)'); // Red Right Arm
    drawGroup('leftArm', 'rgba(16, 185, 129, 0.6)'); // Green Left Arm
    drawGroup('rightLeg', 'rgba(245, 158, 11, 0.6)'); // Orange Right Leg
    drawGroup('leftLeg', 'rgba(217, 70, 239, 0.6)'); // Magenta Left Leg
  };

  const getPixelPartKey = (x: number, y: number): string | null => {
    const bounds = editorLayer === 'base' ? MC_BOUNDS : MC_OVERLAY_BOUNDS;
    for (const [partName, rects] of Object.entries(bounds)) {
      for (const rect of rects) {
        const matchName = rect.name.split(' ').pop()!.toLowerCase();
        const adj = getMinecraftRect(partName, matchName, editorLayer, armType);
        if (adj && x >= adj.x && x < adj.x + adj.w && y >= adj.y && y < adj.y + adj.h) {
          return partName;
        }
      }
    }
    return null;
  };

  const getPixelPart = (x: number, y: number) => {
    const bounds = editorLayer === 'base' ? MC_BOUNDS : MC_OVERLAY_BOUNDS;
    for (const [partName, rects] of Object.entries(bounds)) {
      for (const rect of rects) {
        const matchName = rect.name.split(' ').pop()!.toLowerCase();
        const adj = getMinecraftRect(partName, matchName, editorLayer, armType);
        if (adj && x >= adj.x && x < adj.x + adj.w && y >= adj.y && y < adj.y + adj.h) {
          return `${partName.replace(/([A-Z])/g, ' $1')} (${rect.name})`;
        }
      }
    }
    return null;
  };

  const saveToHistory = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL();
    
    // Discard future stack items if we made new moves after undo
    if (historyIndex.current < historyStack.current.length - 1) {
      historyStack.current = historyStack.current.slice(0, historyIndex.current + 1);
    }
    
    // Only push if it differs from current
    if (historyStack.current[historyIndex.current] !== dataUrl) {
      historyStack.current.push(dataUrl);
      historyIndex.current = historyStack.current.length - 1;
      
      lastSavedDataUrlRef.current = dataUrl;
      onSkinChange(dataUrl);
    }
  };

  const handleUndo = () => {
    if (historyIndex.current > 0) {
      historyIndex.current--;
      restoreFromHistory();
    }
  };

  const handleRedo = () => {
    if (historyIndex.current < historyStack.current.length - 1) {
      historyIndex.current++;
      restoreFromHistory();
    }
  };

  const restoreFromHistory = () => {
    const dataUrl = historyStack.current[historyIndex.current];
    if (!dataUrl || !canvasRef.current) return;
    
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const ctx = canvasRef.current!.getContext('2d')!;
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(img, 0, 0);

      // Update 3D textures in-place
      if (avatarGroupRef.current) {
        updateRobloxAvatarTextures(avatarGroupRef.current, canvasRef.current!, armType === 'slim');
      }

      lastSavedDataUrlRef.current = dataUrl;
      onSkinChange(dataUrl);
    };
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
      a: 255
    } : { r: 0, g: 0, b: 0, a: 255 };
  };

  const drawPixel = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, eraser = false) => {
    if (x < 0 || x >= 64 || y < 0 || y >= 64) return;
    if (eraser) {
      ctx.clearRect(x, y, 1, 1);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  };

  // Find face coordinate and mirror horizontally on same face
  const getMirroredPixel = (x: number, y: number): { x: number; y: number } | null => {
    const bounds = editorLayer === 'base' ? MC_BOUNDS : MC_OVERLAY_BOUNDS;
    for (const [partName, rects] of Object.entries(bounds)) {
      for (const rect of rects) {
        const matchName = rect.name.split(' ').pop()!.toLowerCase();
        const adj = getMinecraftRect(partName, matchName, editorLayer, armType);
        if (adj && x >= adj.x && x < adj.x + adj.w && y >= adj.y && y < adj.y + adj.h) {
          const relX = x - adj.x;
          const mirRelX = adj.w - 1 - relX;
          return { x: adj.x + mirRelX, y };
        }
      }
    }
    return null;
  };

  // Flood fill algorithm
  const performFloodFill = (startX: number, startY: number, colorHex: string, eraser = false) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, 64, 64);
    const data = imgData.data;

    const currentMirror = editorMirrorRef.current;
    const currentArmType = armTypeRef.current;

    const fillColor = eraser ? { r: 0, g: 0, b: 0, a: 0 } : hexToRgb(colorHex);
    const startIdx = (startY * 64 + startX) * 4;
    const startR = data[startIdx];
    const startG = data[startIdx + 1];
    const startB = data[startIdx + 2];
    const startA = data[startIdx + 3];

    if (
      startR === fillColor.r &&
      startG === fillColor.g &&
      startB === fillColor.b &&
      startA === fillColor.a
    ) {
      return;
    }

    const queue: [number, number][] = [[startX, startY]];
    const matchColor = (idx: number) => {
      return (
        data[idx] === startR &&
        data[idx + 1] === startG &&
        data[idx + 2] === startB &&
        data[idx + 3] === startA
      );
    };

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      const idx = (cy * 64 + cx) * 4;

      if (matchColor(idx)) {
        // Check visibility of this part before editing (flood fill support)
        const partKey = getPixelPartKey(cx, cy);
        if (partKey) {
          const isVisible = visiblePartsRef.current[partKey as keyof typeof visibleParts];
          if (!isVisible) {
            // Skip this pixel if the body part is hidden/locked
            continue;
          }
        }

        data[idx] = fillColor.r;
        data[idx + 1] = fillColor.g;
        data[idx + 2] = fillColor.b;
        data[idx + 3] = fillColor.a;

        if (currentMirror) {
          const mirror = getMirroredPixel(cx, cy);
          if (mirror) {
            const mirIdx = (mirror.y * 64 + mirror.x) * 4;
            // Also check visibility on the mirrored side
            const mirPartKey = getPixelPartKey(mirror.x, mirror.y);
            let mirVisible = true;
            if (mirPartKey) {
              mirVisible = visiblePartsRef.current[mirPartKey as keyof typeof visibleParts];
            }
            if (mirVisible) {
              data[mirIdx] = fillColor.r;
              data[mirIdx + 1] = fillColor.g;
              data[mirIdx + 2] = fillColor.b;
              data[mirIdx + 3] = fillColor.a;
            }
          }
        }

        if (cx > 0) queue.push([cx - 1, cy]);
        if (cx < 63) queue.push([cx + 1, cy]);
        if (cy > 0) queue.push([cx, cy - 1]);
        if (cy < 63) queue.push([cx, cy + 1]);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    
    if (avatarGroupRef.current) {
      updateRobloxAvatarTextures(avatarGroupRef.current, canvas, currentArmType === 'slim');
    }
    saveToHistory();
  };

  // 2D Interaction painting
  const handle2DInteract = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * 64);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * 64);

    if (x < 0 || x >= 64 || y < 0 || y >= 64) return;

    // Lock edits on hidden/isolated body parts
    const partKey = getPixelPartKey(x, y);
    if (partKey) {
      const isVisible = visiblePartsRef.current[partKey as keyof typeof visibleParts];
      if (!isVisible) return; // Locked!
    }

    if (editorTool === 'picker') {
      const imgData = ctx.getImageData(x, y, 1, 1).data;
      if (imgData[3] > 0) {
        const hex = '#' + ((1 << 24) + (imgData[0] << 16) + (imgData[1] << 8) + imgData[2]).toString(16).slice(1);
        setEditorColor(hex);
      }
      setEditorTool('pencil');
      return;
    }

    if (editorTool === 'bucket') {
      performFloodFill(x, y, editorColor, false);
      return;
    }

    const eraserMode = editorTool === 'eraser';
    drawPixel(ctx, x, y, editorColor, eraserMode);

    if (editorMirror) {
      const mirror = getMirroredPixel(x, y);
      if (mirror) {
        // Also verify visibility on mirrored side before painting
        const mirPartKey = getPixelPartKey(mirror.x, mirror.y);
        let mirVisible = true;
        if (mirPartKey) {
          mirVisible = visiblePartsRef.current[mirPartKey as keyof typeof visibleParts];
        }
        if (mirVisible) {
          drawPixel(ctx, mirror.x, mirror.y, editorColor, eraserMode);
        }
      }
    }

    // In-place 3D update without state re-rendering
    if (avatarGroupRef.current) {
      updateRobloxAvatarTextures(avatarGroupRef.current, canvas, armType === 'slim');
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDrawing.current = true;
    handle2DInteract(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * 64);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * 64);
      
      // Only update hovered part if we are NOT actively drawing
      if (!isDrawing.current) {
        const part = getPixelPart(x, y);
        if (part !== hoveredPart) {
          setHoveredPart(part);
        }
      }
    }
    
    if (!isDrawing.current) return;
    handle2DInteract(e);
  };

  const handleMouseUpOrLeave = () => {
    if (isDrawing.current) {
      isDrawing.current = false;
      saveToHistory();
    }
  };

  // 3D Painting Raycast handlers
  const handle3DPaint = (meshName: string, materialIndex: number, uv: THREE.Vector2) => {
    if (!canvasRef.current || !avatarGroupRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;

    const faceNames = ['left', 'right', 'top', 'bottom', 'front', 'back'];
    const faceName = faceNames[materialIndex];
    if (!faceName) return;

    // Use current ref values to avoid closure bugs in Three.js events
    const currentLayer = editorLayerRef.current;
    const currentArmType = armTypeRef.current;
    const currentTool = editorToolRef.current;
    const currentColor = editorColorRef.current;
    const currentMirror = editorMirrorRef.current;

    const rect = getMinecraftRect(meshName, faceName, currentLayer, currentArmType);
    if (!rect) return;

    // Map UV coordinates to pixel coordinate
    const px = rect.x + Math.floor(uv.x * rect.w);
    let py = rect.y;
    if (faceName === 'bottom') {
      py += Math.floor(uv.y * rect.h);
    } else {
      py += Math.floor((1 - uv.y) * rect.h);
    }

    if (currentTool === 'picker') {
      const imgData = ctx.getImageData(px, py, 1, 1).data;
      if (imgData[3] > 0) {
        const hex = '#' + ((1 << 24) + (imgData[0] << 16) + (imgData[1] << 8) + imgData[2]).toString(16).slice(1);
        setEditorColor(hex);
      }
      setEditorTool('pencil');
      return;
    }

    if (currentTool === 'bucket') {
      performFloodFill(px, py, currentColor, false);
      return;
    }

    const eraserMode = currentTool === 'eraser';
    drawPixel(ctx, px, py, currentColor, eraserMode);

    if (currentMirror) {
      const mirror = getMirroredPixel(px, py);
      if (mirror) {
        // Verify visibility of mirrored side
        const mirPartKey = getPixelPartKey(mirror.x, mirror.y);
        let mirVisible = true;
        if (mirPartKey) {
          mirVisible = visiblePartsRef.current[mirPartKey as keyof typeof visibleParts];
        }
        if (mirVisible) {
          drawPixel(ctx, mirror.x, mirror.y, currentColor, eraserMode);
        }
      }
    }

    // Update in-place on the GPU
    updateRobloxAvatarTextures(avatarGroupRef.current, canvas, currentArmType === 'slim');
  };

  const handlePaintEnd = () => {
    saveToHistory();
  };

  const handleClearLayer = () => {
    if (!window.confirm(t('confirm_clear_layer'))) return;
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const bounds = editorLayer === 'base' ? MC_BOUNDS : MC_OVERLAY_BOUNDS;

    Object.values(bounds).flat().forEach(rect => {
      let w = rect.w;
      if (armType === 'slim' && rect.name.includes('Arm')) {
        if (rect.name.includes('Front') || rect.name.includes('Back') || rect.name.includes('Top') || rect.name.includes('Bottom')) {
          w = 3;
        }
      }
      ctx.clearRect(rect.x, rect.y, w, rect.h);
    });

    if (avatarGroupRef.current) {
      updateRobloxAvatarTextures(avatarGroupRef.current, canvas, armType === 'slim');
    }
    saveToHistory();
  };

  const handleArmTypeChange = (newArmType: 'classic' | 'slim') => {
    setArmType(newArmType);
    if (viewerRef.current && canvasRef.current) {
      const avatarGroup = buildRobloxAvatar(canvasRef.current, newArmType === 'slim');
      viewerRef.current.setHeadModel(avatarGroup);
      avatarGroupRef.current = avatarGroup;
      applyPartVisibilities(viewerRef.current);
    }
  };

  // Roblox Shirt and Pants export methods
  const handleExportShirt = async () => {
    if (!canvasRef.current) return;
    try {
      await exportRobloxShirt(canvasRef.current, armType === 'slim');
      showToast('success', t('toast_shirt_success'));
    } catch (err: any) {
      showToast('error', t('toast_shirt_error', { error: err.message }));
    }
  };

  const handleExportPants = async () => {
    if (!canvasRef.current) return;
    try {
      await exportRobloxPants(canvasRef.current);
      showToast('success', t('toast_pants_success'));
    } catch (err: any) {
      showToast('error', t('toast_pants_error', { error: err.message }));
    }
  };

  return (
    <div className="skin-editor-grid">
      {/* Column 1: Controls panel */}
      <div className="editor-controls-panel glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(255,255,255,0.05)', height: 'fit-content' }}>
        
        {/* Upload Skin section */}
        <div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 600, color: '#f4f4f5' }}>{t('upload_title')}</h3>
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".png" 
            style={{ display: 'none' }} 
            onChange={handleFileChange}
          />
          
          <div 
            className={`upload-area ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerUploadClick}
            style={{ padding: '12px', textAlign: 'center', cursor: 'pointer', borderRadius: '6px', border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          >
            <Upload size={20} style={{ color: '#818cf8', marginBottom: '4px' }} />
            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600 }}>{t('upload_btn')}</p>
          </div>
        </div>

        {/* Tools Section */}
        <div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 600, color: '#f4f4f5' }}>{t('editor_tools')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button 
              className={`glow-btn-secondary ${editorTool === 'pencil' ? 'active-editor-tool' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', fontSize: '0.8rem' }}
              onClick={() => setEditorTool('pencil')}
            >
              <Pencil size={14} /> {t('tool_pencil')}
            </button>
            <button 
              className={`glow-btn-secondary ${editorTool === 'eraser' ? 'active-editor-tool' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', fontSize: '0.8rem' }}
              onClick={() => setEditorTool('eraser')}
            >
              <Eraser size={14} /> {t('tool_eraser')}
            </button>
            <button 
              className={`glow-btn-secondary ${editorTool === 'bucket' ? 'active-editor-tool' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', fontSize: '0.8rem' }}
              onClick={() => setEditorTool('bucket')}
            >
              <Paintbrush size={14} /> {t('tool_fill')}
            </button>
            <button 
              className={`glow-btn-secondary ${editorTool === 'picker' ? 'active-editor-tool' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', fontSize: '0.8rem' }}
              onClick={() => setEditorTool('picker')}
            >
              <Pipette size={14} /> {t('tool_picker')}
            </button>
          </div>
        </div>

        {/* Undo/Redo & Utility controls */}
        <div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 600, color: '#f4f4f5' }}>{t('editor_history')}</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="glow-btn-secondary" 
              style={{ flex: 1, padding: '8px', display: 'flex', justifyContent: 'center' }} 
              onClick={handleUndo}
              disabled={historyIndex.current <= 0}
            >
              <Undo size={16} />
            </button>
            <button 
              className="glow-btn-secondary" 
              style={{ flex: 1, padding: '8px', display: 'flex', justifyContent: 'center' }} 
              onClick={handleRedo}
              disabled={historyIndex.current >= historyStack.current.length - 1}
            >
              <Redo size={16} />
            </button>
          </div>
        </div>

        {/* Layer Selector */}
        <div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 600, color: '#f4f4f5' }}>{t('editor_layer')}</h3>
          <div className="tabs-container" style={{ padding: '2px', display: 'flex', gap: '4px' }}>
            <button 
              className={`tab-btn ${editorLayer === 'base' ? 'active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '6px', flex: 1 }}
              onClick={() => setEditorLayer('base')}
            >
              <Layers size={12} style={{ marginRight: '4px' }} /> Base
            </button>
            <button 
              className={`tab-btn ${editorLayer === 'overlay' ? 'active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '6px', flex: 1 }}
              onClick={() => setEditorLayer('overlay')}
            >
              <Sparkles size={12} style={{ marginRight: '4px' }} /> Overlay
            </button>
          </div>
        </div>

        {/* Color Palette & Custom Selector */}
        <div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 600, color: '#f4f4f5' }}>{t('editor_color')}</h3>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <input 
              type="color" 
              value={editorColor} 
              onChange={(e) => setEditorColor(e.target.value)}
              style={{ 
                width: '36px', 
                height: '36px', 
                padding: 0, 
                border: 'none', 
                borderRadius: '4px', 
                cursor: 'pointer',
                background: 'transparent'
              }}
            />
            <input 
              type="text" 
              value={editorColor} 
              onChange={(e) => setEditorColor(e.target.value)}
              style={{ 
                width: '1px',
                flex: 1, 
                backgroundColor: 'rgba(255,255,255,0.05)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                color: '#fff', 
                borderRadius: '4px', 
                padding: '0 8px', 
                fontSize: '0.85rem' 
              }}
            />
          </div>
          {/* Swatches */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' }}>
            {COLOR_PALETTE.map((color, index) => (
              <button 
                key={index}
                style={{ 
                  backgroundColor: color, 
                  height: '20px', 
                  borderRadius: '3px', 
                  border: editorColor.toLowerCase() === color.toLowerCase() ? '1.5px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                  cursor: 'pointer'
                }}
                onClick={() => setEditorColor(color)}
              />
            ))}
          </div>
        </div>

        {/* Arm Type Selector */}
        <div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 600, color: '#f4f4f5' }}>{t('arm_type')}</h3>
          <div className="tabs-container" style={{ padding: '2px', display: 'flex', gap: '4px' }}>
            <button
              className={`tab-btn ${armType === 'classic' ? 'active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '6px', flex: 1 }}
              onClick={() => handleArmTypeChange('classic')}
            >
              {t('arm_classic')}
            </button>
            <button
              className={`tab-btn ${armType === 'slim' ? 'active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '6px', flex: 1 }}
              onClick={() => handleArmTypeChange('slim')}
            >
              {t('arm_slim')}
            </button>
          </div>
        </div>

        {/* Body Part Visibility Controls */}
        <div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 600, color: '#f4f4f5', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Eye size={14} /> Partes 3D (Bloquear)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {Object.keys(visibleParts).map((partKey) => {
              const visible = visibleParts[partKey as keyof typeof visibleParts];
              const labels: Record<string, string> = {
                head: 'Cabeza',
                torso: 'Torso',
                rightArm: 'Brazo D.',
                leftArm: 'Brazo I.',
                rightLeg: 'Pierna D.',
                leftLeg: 'Pierna I.'
              };
              return (
                <button
                  key={partKey}
                  className={`glow-btn-secondary ${visible ? 'active-editor-tool' : ''}`}
                  style={{ 
                    padding: '6px 8px', 
                    fontSize: '0.75rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: '4px',
                    backgroundColor: visible ? 'var(--primary)' : 'rgba(255,255,255,0.02)',
                    borderColor: visible ? 'var(--primary)' : 'rgba(255,255,255,0.05)'
                  }}
                  onClick={() => setVisibleParts(prev => ({ ...prev, [partKey]: !visible }))}
                >
                  <span>{labels[partKey] || partKey}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button 
              className="glow-btn-secondary" 
              style={{ flex: 1, padding: '4px 6px', fontSize: '0.7rem' }}
              onClick={() => setVisibleParts({ head: true, torso: true, rightArm: true, leftArm: true, rightLeg: true, leftLeg: true })}
            >
              Mostrar Todo
            </button>
            <button 
              className="glow-btn-secondary" 
              style={{ flex: 1, padding: '4px 6px', fontSize: '0.7rem' }}
              onClick={() => setVisibleParts({ head: false, torso: false, rightArm: false, leftArm: false, rightLeg: false, leftLeg: false })}
            >
              Ocultar Todo
            </button>
          </div>
        </div>

        {/* Roblox Clothing Export buttons */}
        <div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 600, color: '#f4f4f5' }}>Exportar Ropa</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="glow-btn-roblox" 
              style={{ flex: 1, padding: '8px 4px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} 
              onClick={handleExportShirt}
            >
              <Download size={12} /> Shirt
            </button>
            <button 
              className="glow-btn-roblox" 
              style={{ flex: 1, padding: '8px 4px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} 
              onClick={handleExportPants}
            >
              <Download size={12} /> Pants
            </button>
          </div>
        </div>

        {/* Symmetry, Grid & Guides */}
        <div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 600, color: '#f4f4f5' }}>{t('editor_options')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="toggle-container" style={{ fontSize: '0.8rem', justifyContent: 'flex-start' }}>
              <input 
                type="checkbox" 
                checked={editorMirror} 
                onChange={(e) => setEditorMirror(e.target.checked)}
                style={{ display: 'none' }}
              />
              <span className="checkbox-custom"></span>
              <span>{t('editor_mirror')}</span>
            </label>

            <label className="toggle-container" style={{ fontSize: '0.8rem', justifyContent: 'flex-start' }}>
              <input 
                type="checkbox" 
                checked={showGuide} 
                onChange={(e) => setShowGuide(e.target.checked)}
                style={{ display: 'none' }}
              />
              <span className="checkbox-custom"></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Eye size={12} /> {t('editor_guides')}
              </span>
            </label>

            <label className="toggle-container" style={{ fontSize: '0.8rem', justifyContent: 'flex-start' }}>
              <input 
                type="checkbox" 
                checked={showGrid} 
                onChange={(e) => setShowGrid(e.target.checked)}
                style={{ display: 'none' }}
              />
              <span className="checkbox-custom"></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Grid size={12} /> {t('editor_grid')}
              </span>
            </label>
          </div>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button 
            className="glow-btn-secondary" 
            style={{ width: '100%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.05)' }} 
            onClick={handleClearLayer}
          >
            <Trash2 size={14} /> {t('editor_clear')}
          </button>
        </div>
      </div>

      {/* Column 2: 2D Grid Canvas Panel */}
      <div 
        className="editor-canvas-panel glass-panel" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '24px', 
          position: 'relative',
          minHeight: '520px',
          border: '1px solid rgba(255,255,255,0.05)',
          height: 'fit-content'
        }}
      >
        <div 
          style={{ 
            position: 'relative', 
            width: '480px', 
            height: '480px', 
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            border: '2px solid rgba(255,255,255,0.1)',
            borderRadius: '4px',
            backgroundColor: '#18181b', 
            overflow: 'hidden'
          }}
        >
          {/* Transparency grid background */}
          <div 
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              width: '100%', 
              height: '100%', 
              opacity: 0.1,
              backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
              pointerEvents: 'none'
            }}
          />

          {/* Actual skin canvas */}
          <canvas
            ref={canvasRef}
            width={64}
            height={64}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '480px',
              height: '480px',
              imageRendering: 'pixelated',
              cursor: editorTool === 'picker' ? 'copy' : 'crosshair'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
          />

          {/* Grid lines overlay */}
          {showGrid && (
            <div 
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
                backgroundSize: '7.5px 7.5px' // adjusted to match 480px canvas
              }}
            />
          )}

          {/* Body bounds guides overlay */}
          <canvas
            ref={overlayCanvasRef}
            width={512}
            height={512}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '480px',
              height: '480px',
              pointerEvents: 'none'
            }}
          />
        </div>

        {/* Hover info tooltip */}
        <div style={{ marginTop: '12px', height: '20px', fontSize: '0.8rem', color: '#a1a1aa' }}>
          {hoveredPart ? (
            <span>
              {t('editing_part')}: <strong style={{ color: '#fff' }}>{hoveredPart}</strong>
            </span>
          ) : (
            <span>{t('hover_to_identify')}</span>
          )}
        </div>
      </div>

      {/* Column 3: 3D Previewer Panel */}
      <div 
        className="glass-panel viewer-panel" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '20px', 
          border: '1px solid rgba(255,255,255,0.05)', 
          height: 'fit-content',
          padding: '16px'
        }}
      >
        <div 
          ref={viewerContainerRef} 
          className="viewer-canvas-container" 
          style={{ 
            minHeight: '480px', 
            background: '#0c0c0e', 
            borderRadius: '4px', 
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}
        >
          {/* ThreeViewer canvas will be appended here */}
        </div>

        {/* Toolbar & Controls */}
        <div className="viewer-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
          <div className="toolbar-controls" style={{ display: 'flex', gap: '16px' }}>
            {/* Toggle Grid */}
            <label className="toggle-container" style={{ fontSize: '0.8rem' }}>
              <input 
                type="checkbox" 
                checked={show3DGrid}
                onChange={(e) => setShow3DGrid(e.target.checked)}
                style={{ display: 'none' }}
              />
              <span className="checkbox-custom"></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Grid size={14} /> {t('opt_grid')}
              </span>
            </label>

            {/* Toggle Rotate */}
            <label className="toggle-container" style={{ fontSize: '0.8rem' }}>
              <input 
                type="checkbox" 
                checked={autoRotate}
                onChange={(e) => setAutoRotate(e.target.checked)}
                style={{ display: 'none' }}
              />
              <span className="checkbox-custom"></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RotateCw size={14} /> {t('opt_rotate')}
              </span>
            </label>
          </div>

          <div className="viewer-actions">
            <button 
              className="glow-btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '0.8rem' }} 
              onClick={() => viewerRef.current?.resetCamera(new THREE.Vector3(0, 1.2, 7), new THREE.Vector3(0, 1.2, 0))}
            >
              {t('btn_front_view')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
