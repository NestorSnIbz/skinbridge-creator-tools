import { useState, useEffect, useRef } from 'react';
import { Upload, RotateCw, Grid, Download } from 'lucide-react';
import { useTranslation } from '../modules/i18n';
import { Head } from 'vite-react-ssg';
import { build3DHead } from '../modules/HeadBuilder';
import { ThreeViewer } from '../modules/ThreeViewer';
import { exportToGLB } from '../modules/GLBExporter';
import { exportToBBModel } from '../modules/BBModelExporter';
import { exportToOBJ } from '../modules/OBJExporter';
import { exportToFBX } from '../modules/FBXExporter';
import { type ExtractedFaces } from '../modules/TextureExtractor';
import { useShareHead3d } from '../hooks/useShareHead3d';

interface Head3DWorkspaceProps {
  skinImage: HTMLImageElement | null;
  skinSrc: string;
  extractedFaces: ExtractedFaces | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  dragActive: boolean;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  triggerUploadClick: () => void;
  showToast: (type: 'success' | 'error', message: string) => void;
  logExport: (format: string, filename: string) => void;
}

/**
 * Generates a structured 3x2 grid image containing cropped base and overlay faces,
 * clearly labeled and scaled up. This makes it trivial for the Vision model to identify
 * pixel coordinates and map transparency accurately.
 */
function generateAIInputImage(skinImg: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  const ctx = canvas.getContext('2d')!;

  // Fill dark background
  ctx.fillStyle = '#1e1e2e';
  ctx.fillRect(0, 0, 720, 480);

  // Face definitions based on Minecraft skin layout coordinates
  const faces = [
    { key: 'right',  name: 'RIGHT FACE',  baseX: 16, baseY: 8, overlayX: 48, overlayY: 8, gridX: 0, gridY: 0 },
    { key: 'left',   name: 'LEFT FACE',   baseX: 0,  baseY: 8, overlayX: 32, overlayY: 8, gridX: 1, gridY: 0 },
    { key: 'top',    name: 'TOP FACE',    baseX: 8,  baseY: 0, overlayX: 40, overlayY: 0, gridX: 2, gridY: 0 },
    { key: 'bottom', name: 'BOTTOM FACE', baseX: 16, baseY: 0, overlayX: 48, overlayY: 0, gridX: 0, gridY: 1 },
    { key: 'front',  name: 'FRONT FACE',  baseX: 8,  baseY: 8, overlayX: 40, overlayY: 8, gridX: 1, gridY: 1 },
    { key: 'back',   name: 'BACK FACE',   baseX: 24, baseY: 8, overlayX: 56, overlayY: 8, gridX: 2, gridY: 1 }
  ];

  ctx.imageSmoothingEnabled = false;

  faces.forEach((f) => {
    const startX = f.gridX * 240;
    const startY = f.gridY * 240;

    // Draw Face Name
    ctx.fillStyle = '#f5c2e7';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(f.name, startX + 20, startY + 30);

    // Draw Labels
    ctx.fillStyle = '#a6adc8';
    ctx.font = '12px sans-serif';
    ctx.fillText('Base', startX + 20, startY + 50);
    ctx.fillText('Overlay', startX + 130, startY + 50);

    const scale = skinImg.naturalWidth ? (skinImg.naturalWidth / 64) : (skinImg.width / 64 || 1);

    // Draw Base Head Face (8x8 * scale) scaled to 80x80
    ctx.drawImage(
      skinImg,
      f.baseX * scale,
      f.baseY * scale,
      8 * scale,
      8 * scale,
      startX + 20,
      startY + 60,
      80,
      80
    );

    // Draw Overlay Face (8x8 * scale) scaled to 80x80
    ctx.drawImage(
      skinImg,
      f.overlayX * scale,
      f.overlayY * scale,
      8 * scale,
      8 * scale,
      startX + 130,
      startY + 60,
      80,
      80
    );

    // Draw border around the faces
    ctx.strokeStyle = '#45475a';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX + 20, startY + 60, 80, 80);
    ctx.strokeRect(startX + 130, startY + 60, 80, 80);
  });

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

interface HeightmapData {
  message?: string;
  offsets: Record<string, number>;
  right: number[][];
  left: number[][];
  top: number[][];
  bottom: number[][];
  front: number[][];
  back: number[][];
}

/**
 * Validates the JSON heightmap response from OpenAI, ensuring it conforms to the face offsets
 * and the 6-face 8x8 matrix format. Returns a fallback object if missing or corrupt.
 */
function validateHeightmap(json: any): HeightmapData {
  const faces = ['right', 'left', 'top', 'bottom', 'front', 'back'];
  const validatedOffsets: Record<string, number> = {};
  
  if (json && json.offsets && typeof json.offsets === 'object') {
    for (const face of faces) {
      const val = Number(json.offsets[face]);
      // Allow values between 4.0 and 4.3. Default to 4.0.
      if (!isNaN(val) && val >= 4.0 && val <= 4.3) {
        validatedOffsets[face] = val;
      } else {
        validatedOffsets[face] = 4.0;
      }
    }
  } else {
    for (const face of faces) {
      validatedOffsets[face] = 4.0;
    }
  }

  const validatedData: HeightmapData = {
    message: typeof json?.message === 'string' ? json.message : undefined,
    offsets: validatedOffsets,
    right: [], left: [], top: [], bottom: [], front: [], back: []
  };

  for (const face of faces) {
    let matrix: number[][] = [];
    if (json && Array.isArray(json[face])) {
      for (let r = 0; r < 8; r++) {
        const rowData = json[face][r];
        const validatedRow: number[] = [];
        for (let c = 0; c < 8; c++) {
          const val = Number(rowData?.[c]);
          if (val === 1 || val === 3) {
            validatedRow.push(val);
          } else if (val === 2) {
            // Legacy: treat as flush (1)
            validatedRow.push(1);
          } else if (val === 4) {
            // Legacy: treat as floating (3)
            validatedRow.push(3);
          } else {
            validatedRow.push(0);
          }
        }
        matrix.push(validatedRow);
      }
    } else {
      matrix = Array(8).fill(null).map(() => Array(8).fill(1));
    }
    validatedData[face as keyof Omit<HeightmapData, 'offsets' | 'message'>] = matrix;
  }

  // Corner Alignment Pass to guarantee perfect, hole-free 3D seams
  // Front col 0 <-> Left col 7
  // Front col 7 <-> Right col 0
  // Back col 0 <-> Right col 7
  // Back col 7 <-> Left col 0
  const fM = validatedData.front;
  const lM = validatedData.left;
  const rM = validatedData.right;
  const bM = validatedData.back;

  if (fM.length === 8 && lM.length === 8 && rM.length === 8 && bM.length === 8) {
    for (let r = 0; r < 8; r++) {
      // 1. Front col 0 meets Left col 7
      const maxFL = Math.max(fM[r][0], lM[r][7]);
      fM[r][0] = maxFL;
      lM[r][7] = maxFL;

      // 2. Front col 7 meets Right col 0
      const maxFR = Math.max(fM[r][7], rM[r][0]);
      fM[r][7] = maxFR;
      rM[r][0] = maxFR;

      // 3. Back col 0 meets Right col 7
      const maxBR = Math.max(bM[r][0], rM[r][7]);
      bM[r][0] = maxBR;
      rM[r][7] = maxBR;

      // 4. Back col 7 meets Left col 0
      const maxBL = Math.max(bM[r][7], lM[r][0]);
      bM[r][7] = maxBL;
      lM[r][0] = maxBL;
    }
  }

  return validatedData;
}

export default function Head3DWorkspace({
  skinImage,
  skinSrc,
  extractedFaces,
  fileInputRef,
  handleFileChange,
  dragActive,
  handleDrag,
  handleDrop,
  triggerUploadClick,
  showToast,
  logExport,
}: Head3DWorkspaceProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'head' | 'overlay'>('head');
  const [showGrid, setShowGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);

  const { share: shareHead3d, minutesLeft } = useShareHead3d();
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Anti-bot & Form States
  const [creatorName, setCreatorName] = useState('');
  const [description, setDescription] = useState('');
  const [puzzleA, setPuzzleA] = useState(0);
  const [puzzleB, setPuzzleB] = useState(0);
  const [puzzleAnswer, setPuzzleAnswer] = useState('');
  const [captchaError, setCaptchaError] = useState(false);

  // OpenAI Voxel Relief / IA States
  const [openaiKey, setOpenaiKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('openai_api_key') || '';
    }
    return '';
  });
  const [heightmap, setHeightmap] = useState<any | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('custom_heightmap');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return null;
        }
      }
    }
    return null;
  });
  const [useAIRelief, setUseAIRelief] = useState<boolean>(false);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // AI Chat Adjustment States
  const [aiMessages, setAiMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  interface ChatBubble {
    role: 'user' | 'assistant';
    text: string;
  }

  const [chatBubbles, setChatBubbles] = useState<ChatBubble[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('custom_heightmap');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.message) {
            return [
              { role: 'assistant', text: parsed.message }
            ];
          }
        } catch {
          // ignore
        }
      }
    }
    return [];
  });

  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatBubbles]);

  const handleOpenaiKeyChange = (val: string) => {
    setOpenaiKey(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('openai_api_key', val);
    }
  };

  const handleHeightmapChange = (map: HeightmapData | null) => {
    setHeightmap(map);
    if (typeof window !== 'undefined') {
      if (map) {
        localStorage.setItem('custom_heightmap', JSON.stringify(map));
      } else {
        localStorage.removeItem('custom_heightmap');
      }
    }
  };

  const handleGenerateAIRelief = async () => {
    if (!skinImage) {
      showToast('error', t('toast_load_skin_first'));
      return;
    }
    if (!openaiKey.trim()) {
      showToast('error', t('toast_api_key_required'));
      return;
    }
    
    setAiLoading(true);
    try {
      const base64Img = generateAIInputImage(skinImage);
      
      const promptText = `You are a 3D Minecraft voxel artist.
We have provided an image containing the 6 faces of a Minecraft head skin (arranged in a 3x2 grid: RIGHT, LEFT, TOP in the first row, and BOTTOM, FRONT, BACK in the second row).
For each face, you are presented with the "Base" head layer (8x8 pixels) on the left, and the "Overlay" layer (8x8 pixels) on the right.
The canvas background is a dark slate color (#1e1e2e).

Your task is to analyze the skin image and generate:
1. "message": A short, friendly explanation (in Spanish if the user's UI is in Spanish, or English otherwise) explaining which features you highlighted (e.g. crown, goggles, hair, headphones) and how you handled corner alignment.
2. "offsets": A mapping of all 6 faces ("right", "left", "top", "bottom", "front", "back") to their base offset value (always return 4.0 for all faces).
3. An 8x8 heightmap matrix for each face ("right", "left", "top", "bottom", "front", "back").
   - The pixel values in the 8x8 grid must be:
     - 0: if the pixel is transparent or empty in the "Overlay" layer. Transparent pixels will display the dark background color (#1e1e2e) on the canvas.
     - 1: flush overlay. The overlay pixel protrudes flush against the base head surface. Use this for hair (forehead, sides, top, back), flat skin details, and minor ornaments.
     - 3: floating overlay. The overlay pixel floats with a small gap behind it, away from the base head surface. Use this for accessories that hover over the head: goggles, glasses, headphones (pads and headband), mask visors, crowns, or wrapping headbands.

CRITICAL RULES:
1. Identifying Transparent vs Opaque Pixels (DO NOT LOSE ANY OVERLAY PIXELS):
   - Any pixel in the "Overlay" layer whose color matches the dark background #1e1e2e is transparent. Its value MUST be 0.
   - Any pixel in the "Overlay" layer that does NOT match #1e1e2e is colored/opaque. Its value MUST be 1 or 3. It must NEVER be 0. Be extremely precise — do not skip or delete any colored pixels of the overlay.
2. Vertical Corner Alignment (CRITICAL for seamless 3D seams):
   - The vertical corners of the head meet at:
     - Front face column 0 meets Left face column 7.
     - Front face column 7 meets Right face column 0.
     - Back face column 0 meets Right face column 7.
     - Back face column 7 meets Left face column 0.
   - At these boundaries the heightmap values of the matching column pair MUST BE IDENTICAL in every row. If Front[row][0] is 3, then Left[row][7] must also be 3. If one is 0 the other must also be 0.
3. Accessories Wrapping (Continuous Rings):
   - Accessories that wrap horizontally around the head (crowns, headbands, goggle straps, headphones) must use the same value (all 3) across all faces and corner columns they occupy, forming a continuous 3D ring.
   - Main hair must remain flush (1) — do NOT make hair float.
4. Horizontal Feature Alignment:
   - Features wrapping horizontally must be on the same row numbers on all horizontal faces (Front, Right, Back, Left). Do not shift them vertically between faces.
5. Uniform Relief Size:
   - All overlay pixels (value 1 or 3) produce the same uniform thickness. There are only two states: flush (1) or floating (3). Do NOT use values 2 or 4.

Format the output strictly as a JSON object:
{
  "message": "A short friendly explanation",
  "offsets": {
    "right": 4.0,
    "left": 4.0,
    "top": 4.0,
    "bottom": 4.0,
    "front": 4.0,
    "back": 4.0
  },
  "right": [[number, ...], ... (8x8 matrix)],
  "left": [[number, ...], ... (8x8 matrix)],
  "top": [[number, ...], ... (8x8 matrix)],
  "bottom": [[number, ...], ... (8x8 matrix)],
  "front": [[number, ...], ... (8x8 matrix)],
  "back": [[number, ...], ... (8x8 matrix)]
}

Each matrix must have exactly 8 rows and 8 columns. Only use integers 0, 1, or 3 (do NOT use 2 or 4).`;


      const initialUserMsg = {
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64Img}`
            }
          }
        ]
      };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [initialUserMsg],
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      const parsed = JSON.parse(content);
      
      const validatedMap = validateHeightmap(parsed);
      handleHeightmapChange(validatedMap);

      const assistantMsg = {
        role: 'assistant',
        content: content
      };
      setAiMessages([initialUserMsg, assistantMsg]);
      setChatBubbles([
        { role: 'user', text: t('chat_user_generate_initial') },
        { role: 'assistant', text: validatedMap.message || t('chat_ai_initial_fallback') }
      ]);
      showToast('success', t('toast_ai_relief_success'));
    } catch (err: any) {
      console.error(err);
      showToast('error', t('toast_ai_relief_error', { error: err.message || err }));
    } finally {
      setAiLoading(false);
    }
  };

  const handleAdjustAIRelief = async () => {
    if (!openaiKey.trim()) {
      showToast('error', t('toast_api_key_required'));
      return;
    }
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatBubbles(prev => [...prev, { role: 'user', text: userText }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const userMsg = {
        role: 'user',
        content: `Here is my request for adjustment: ${userText}

Please analyze the original skin image provided in the first message and adjust the heightmap matrices accordingly.
The canvas background is a dark slate color (#1e1e2e). Any transparent/empty pixel in the "Overlay" layer will show this background color and MUST have value 0. Any colored/opaque pixel MUST have value 1 or 3 (never 0). Do not delete or skip any colored parts of the overlay.

Pixel values:
- 0: transparent/empty overlay pixel.
- 1: flush overlay (protrudes directly against the head surface). Use for hair, flat skin details, minor ornaments.
- 3: floating overlay (hovers with a small gap behind it). Use for goggles, glasses, headphones, crowns, headbands, mask visors.
Do NOT use values 2 or 4 — only 0, 1, or 3 are valid.

You must return the COMPLETE updated JSON object containing:
- "message": A short, friendly explanation (in Spanish if my request is in Spanish, or English if it's in English) explaining exactly what you adjusted.
- "offsets": a mapping of all 6 faces ("right", "left", "top", "bottom", "front", "back") to their base offset values (always 4.0 for all faces).
- "right", "left", "top", "bottom", "front", "back": the corresponding 8x8 matrices.

Recall the alignment rules:
1. Opaque vs Transparent: Any pixel in the "Overlay" showing #1e1e2e must be 0. Opaque pixels must be 1 or 3 (never 0, never 2 or 4).
2. Corner vertical columns MUST have identical values to their adjacent face matching pair (Front col 0 <-> Left col 7, Front col 7 <-> Right col 0, Back col 0 <-> Right col 7, Back col 7 <-> Left col 0) so they connect perfectly in 3D.
3. Accessories Wrapping (Continuous Rings): Accessories that wrap horizontally (crowns, headbands, goggle straps, headphones) must use value 3 on all faces and corner columns they occupy, forming a continuous 3D ring. Main hair must remain flush (1).
4. Horizontal Feature Alignment: Features wrapping horizontally must be on the same row numbers on all horizontal faces (Front, Right, Back, Left). Do not shift them vertically.
5. Do not output any conversational text or partial JSON. Only return the full updated JSON.`
      };

      const updatedMessages = [...aiMessages, userMsg];

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: updatedMessages,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      const parsed = JSON.parse(content);

      const validatedMap = validateHeightmap(parsed);
      handleHeightmapChange(validatedMap);

      const assistantMsg = {
        role: 'assistant',
        content: content
      };
      setAiMessages([...updatedMessages, assistantMsg]);
      setChatBubbles(prev => [
        ...prev,
        { role: 'assistant', text: validatedMap.message || t('chat_ai_adjust_fallback') }
      ]);
      showToast('success', t('toast_ai_relief_success'));
    } catch (err: any) {
      console.error(err);
      showToast('error', t('toast_ai_relief_error', { error: err.message || err }));
    } finally {
      setChatLoading(false);
    }
  };

  const generatePuzzle = () => {
    setPuzzleA(Math.floor(Math.random() * 8) + 2); // 2 to 9
    setPuzzleB(Math.floor(Math.random() * 8) + 2); // 2 to 9
    setPuzzleAnswer('');
  };

  const handleShareClick = () => {
    setShowShareModal(true);
    setShareUrl(null);
    setShareError(null);
    setShareLoading(false);
    setCreatorName('');
    setDescription('');
    setCaptchaError(false);
    generatePuzzle();
  };

  const handleConfirmShare = async () => {
    const expected = puzzleA + puzzleB;
    if (parseInt(puzzleAnswer, 10) !== expected) {
      setCaptchaError(true);
      generatePuzzle();
      return;
    }
    setCaptchaError(false);

    setShareLoading(true);
    setShareError(null);
    try {
      let previewCanvas: HTMLCanvasElement | null = null;
      if (viewerRef.current) {
        viewerRef.current.renderOnce();
        previewCanvas = viewerRef.current.getCanvas();
      }
      const url = await shareHead3d(
        previewCanvas,
        skinSrc,
        extractedFaces,
        creatorName,
        description
      );
      setShareUrl(url);



      // Save to shared history in localStorage
      const historyStr = localStorage.getItem('shared_history') || '[]';
      const history = JSON.parse(historyStr);
      
      let previewUrl = '';
      if (previewCanvas) {
        previewUrl = previewCanvas.toDataURL('image/png');
      }

      const slugFromUrl = url.split('/').pop() || '';

      const newHistoryItem = {
        slug: slugFromUrl,
        type: 'head3d',
        creatorName: creatorName.trim() || 'Anonymous',
        description: description.trim() || '',
        previewUrl: previewUrl,
        createdAt: Date.now(),
        skinUrl: skinSrc
      };

      localStorage.setItem('shared_history', JSON.stringify([newHistoryItem, ...history]));
      window.dispatchEvent(new Event('storage'));

    } catch (err: any) {
      setShareError(err.message || 'Error occurred while sharing');
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<ThreeViewer | null>(null);

  // Reset heightmap and useAIRelief when a new skin is loaded
  useEffect(() => {
    setHeightmap(null);
    setUseAIRelief(false);
    setAiMessages([]);
    setChatInput('');
    setChatBubbles([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('custom_heightmap');
    }
  }, [skinImage]);

  // Initialize and update the 3D Head viewer
  useEffect(() => {
    if (containerRef.current && !viewerRef.current) {
      const viewer = new ThreeViewer(containerRef.current);
      viewerRef.current = viewer;
      viewer.setGridY(-5);
    }
    if (viewerRef.current) {
      viewerRef.current.autoRotate = autoRotate;
      viewerRef.current.setGridVisible(showGrid);
      if (skinImage) {
        const activeHeightmap = useAIRelief && heightmap ? heightmap : undefined;
        const headGroup = build3DHead(skinImage, activeHeightmap);
        viewerRef.current.setHeadModel(headGroup);
      }
    }
    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [skinImage, autoRotate, showGrid, useAIRelief, heightmap]);

  const handleExportOBJ = async () => {
    if (!viewerRef.current) return;
    const headModel = viewerRef.current.getHeadModel();
    if (!headModel) {
      showToast('error', t('toast_no_3d_model'));
      return;
    }
    if (!skinImage) {
      showToast('error', t('toast_load_skin_first'));
      return;
    }
    try {
      await exportToOBJ(headModel, skinImage, useAIRelief && heightmap ? heightmap : undefined);
      showToast('success', t('toast_obj_success'));
      logExport('OBJ', 'skinbridge_cabeza.obj');
    } catch (err: any) {
      showToast('error', t('toast_obj_error', { error: err.message }));
    }
  };

  const handleExportFBX = async () => {
    if (!viewerRef.current) return;
    const headModel = viewerRef.current.getHeadModel();
    if (!headModel) {
      showToast('error', t('toast_no_3d_model'));
      return;
    }
    if (!skinImage) {
      showToast('error', t('toast_load_skin_first'));
      return;
    }
    try {
      await exportToFBX(headModel, skinImage, useAIRelief && heightmap ? heightmap : undefined);
      showToast('success', t('toast_fbx_success'));
      logExport('FBX', 'skinbridge_cabeza.fbx');
    } catch (err: any) {
      showToast('error', t('toast_fbx_error', { error: err.message }));
    }
  };

  const handleExportGLB = async () => {
    if (!viewerRef.current) return;
    const headModel = viewerRef.current.getHeadModel();
    if (!headModel) {
      showToast('error', t('toast_no_3d_model'));
      return;
    }

    try {
      await exportToGLB(headModel, skinImage || undefined, useAIRelief && heightmap ? heightmap : undefined);
      showToast('success', t('toast_glb_success'));
      logExport('GLB', 'skinbridge_cabeza.glb');
    } catch (err: any) {
      showToast('error', t('toast_glb_error', { error: err.message }));
    }
  };

  const handleExportBBModel = () => {
    if (!skinImage) {
      showToast('error', t('toast_bbmodel_load_skin'));
      return;
    }

    try {
      exportToBBModel(skinImage);
      showToast('success', t('toast_bbmodel_success'));
      logExport('BBMODEL', 'skinbridge_cabeza.bbmodel');
    } catch (err: any) {
      showToast('error', t('toast_bbmodel_error', { error: err.message }));
    }
  };

  const currentFaces = (activeTab === 'head' || activeTab === 'overlay') && extractedFaces ? extractedFaces[activeTab] : null;

  return (
    <main className="main-grid">
      <Head>
        <title>Minecraft Skin 3D Head Viewer &amp; Exporter | SkinBridge</title>
        <meta name="description" content="View your Minecraft skin as an interactive 3D head model. Export all 6 face textures (top, bottom, left, right, front, back) from your skin online." />
        <meta property="og:title" content="Minecraft Skin 3D Head Viewer &amp; Exporter" />
        <meta property="og:description" content="View your Minecraft skin as an interactive 3D head model and export all face textures online." />
        <link rel="canonical" href="https://skinbridge.vercel.app/head3d" />
      </Head>
      {/* Left Side: Uploading and 2D Previews */}
      <section className="glass-panel sidebar-panel">
        <div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 700 }}>{t('upload_title')}</h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#a1a1aa' }}>{t('upload_desc')}</p>
          
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
          >
            <Upload size={36} style={{ color: '#818cf8', marginBottom: '8px' }} />
            <p style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 600 }}>{t('upload_btn')}</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#71717a' }}>{t('upload_format_hint')}</p>
          </div>
        </div>

        {/* Skin Image Preview */}
        {skinSrc && (
          <div className="skin-preview-section">
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 600 }}>{t('skin_original')}</h3>
            <div className="skin-canvas-container">
              <img 
                src={skinSrc} 
                alt="Minecraft Skin Preview" 
                className="skin-preview-img"
              />
            </div>
          </div>
        )}

        {/* Extracted Faces grid */}
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 600 }}>{t('extracted_faces')}</h3>
          
          <div className="tabs-container">
            <button 
              className={`tab-btn ${activeTab === 'head' ? 'active' : ''}`}
              onClick={() => setActiveTab('head')}
            >
              {t('tab_base_layer')}
            </button>
            <button 
              className={`tab-btn ${activeTab === 'overlay' ? 'active' : ''}`}
              onClick={() => setActiveTab('overlay')}
            >
              {t('tab_outer_layer')}
            </button>
          </div>

          {currentFaces && (
            <div className="faces-grid">
              {Object.entries(currentFaces).map(([key, face]) => (
                <div key={key} className="face-card">
                  <div className="face-img-container">
                    <img src={face.dataUrl} alt={face.name} className="face-img" />
                  </div>
                  <span className="face-label">{face.name.split(' ')[0]}</span>
                  <span className="face-coords">x:{face.x} y:{face.y}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3D Voxel Relief (IA) Section */}
        {skinImage && (
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{t('relief_classic')} / {t('relief_ai')}</h3>
            <div className="tabs-container">
              <button 
                className={`tab-btn ${!useAIRelief ? 'active' : ''}`}
                onClick={() => setUseAIRelief(false)}
              >
                {t('relief_classic')}
              </button>
              <button 
                className={`tab-btn ${useAIRelief ? 'active' : ''}`}
                onClick={() => setUseAIRelief(true)}
              >
                {t('relief_ai')}
              </button>
            </div>
            
            {useAIRelief && (
              <div className="glass-panel" style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#a1a1aa', lineHeight: '1.4' }}>
                  {t('relief_description')}
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e4e4e7' }}>
                    {t('openai_key_label')}
                  </label>
                  <input
                    type="password"
                    value={openaiKey}
                    onChange={(e) => handleOpenaiKeyChange(e.target.value)}
                    placeholder={t('openai_key_placeholder')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#fff',
                      fontSize: '0.8rem',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                
                <button
                  className="glow-btn"
                  onClick={handleGenerateAIRelief}
                  disabled={aiLoading}
                  style={{
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    width: '100%',
                    justifyContent: 'center'
                  }}
                >
                  {aiLoading ? t('btn_generating_relief') : t('btn_generate_relief')}
                </button>
                
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#71717a', lineHeight: '1.3' }}>
                  {t('relief_export_note')}
                </p>

                {/* Interactive AI Chat controls */}
                {heightmap && (
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                    {/* Current offsets decided by AI */}
                    {heightmap.offsets && (
                      <div style={{
                        padding: '10px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                      }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e4e4e7', marginBottom: '6px' }}>
                          {t('label_ai_offsets')}
                        </div>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: '6px',
                        }}>
                          {Object.entries(heightmap.offsets).map(([face, val]) => {
                            const faceMatrix = heightmap[face] as number[][] | undefined;
                            const hasFloating = faceMatrix ? faceMatrix.some(row => row.some(v => v === 3 || v === 4)) : false;
                            const isFloating = (val as number) > 4.0 || hasFloating;
                            return (
                              <div key={face} style={{
                                padding: '4px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                fontSize: '0.7rem',
                                color: '#a1a1aa',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <span style={{ textTransform: 'capitalize', fontWeight: 'bold', color: '#e4e4e7', marginBottom: '2px' }}>
                                  {t(`face_${face}`) || face}
                                </span>
                                <span style={{
                                  color: isFloating ? '#38bdf8' : '#a1a1aa',
                                  fontWeight: isFloating ? 'bold' : 'normal'
                                }}>
                                  {isFloating ? t('offset_gap') : t('offset_flush')}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Chat bubbles container */}
                    {chatBubbles.length > 0 && (
                      <div style={{
                        maxHeight: '160px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        padding: '8px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                      }} ref={chatContainerRef}>
                        {chatBubbles.map((bubble, idx) => (
                          <div key={idx} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: bubble.role === 'user' ? 'flex-end' : 'flex-start',
                          }}>
                            <div style={{
                              maxWidth: '85%',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              fontSize: '0.75rem',
                              lineHeight: '1.3',
                              backgroundColor: bubble.role === 'user' ? 'rgba(13, 148, 136, 0.4)' : 'rgba(255, 255, 255, 0.05)',
                              color: bubble.role === 'user' ? '#fff' : '#e4e4e7',
                              border: bubble.role === 'user' ? '1px solid rgba(13, 148, 136, 0.6)' : '1px solid rgba(255, 255, 255, 0.05)',
                            }}>
                              {bubble.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e4e4e7', display: 'block', marginTop: '4px' }}>
                      {t('label_chat_instructions')}
                    </label>
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={t('placeholder_chat_input')}
                      rows={2}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        fontSize: '0.8rem',
                        outline: 'none',
                        resize: 'none',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      className="glow-btn-secondary"
                      onClick={handleAdjustAIRelief}
                      disabled={chatLoading || !chatInput.trim()}
                      style={{
                        padding: '8px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        width: '100%',
                        justifyContent: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {chatLoading ? t('btn_adjusting_relief') : t('btn_adjust_relief')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Right Side: Interactive 3D Viewer & Exporters */}
      <section className="glass-panel viewer-panel">
        {/* Three.js viewport */}
        <div ref={containerRef} className="viewer-canvas-container">
          {/* ThreeViewer canvas will be appended here */}
        </div>

        {/* Toolbar & Exporters */}
        <div className="viewer-toolbar">
          <div className="toolbar-controls">
            {/* Toggle Grid */}
            <label className="toggle-container">
              <input 
                type="checkbox" 
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                style={{ display: 'none' }}
              />
              <span className="checkbox-custom"></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Grid size={16} /> {t('opt_grid')}
              </span>
            </label>

            {/* Toggle Rotate */}
            <label className="toggle-container">
              <input 
                type="checkbox" 
                checked={autoRotate}
                onChange={(e) => setAutoRotate(e.target.checked)}
                style={{ display: 'none' }}
              />
              <span className="checkbox-custom"></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RotateCw size={16} /> {t('opt_rotate')}
              </span>
            </label>
          </div>

          <div className="viewer-actions">
            <button className="glow-btn-secondary" onClick={handleExportOBJ}>
              <Download size={18} /> OBJ
            </button>
            <button className="glow-btn-secondary" onClick={handleExportFBX}>
              <Download size={18} /> FBX
            </button>
            <button className="glow-btn-secondary" onClick={handleExportGLB}>
              <Download size={18} /> GLB
            </button>
            <button className="glow-btn" onClick={handleExportBBModel}>
              <Download size={18} /> BBMODEL
            </button>
            {skinImage && (
              <button className="glow-btn-secondary" onClick={handleShareClick} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                {t('btn_share_workspace')}
              </button>
            )}
          </div>
        </div>
      </section>

      {showShareModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div className="glass-panel" style={{
            padding: '28px',
            maxWidth: '450px',
            width: '90%',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            border: '2px solid rgba(255, 255, 255, 0.05)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
          }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f3f4f6' }}>
              {t('share_title')}
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#9ca3af', lineHeight: '1.5' }}>
              {t('share_desc')}
            </p>
            <div style={{
              fontSize: '0.8rem',
              color: '#fca5a5',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.15)',
              padding: '10px 12px',
              borderRadius: '8px',
              lineHeight: '1.4'
            }}>
              ⚠️ {t('share_disclaimer')}
            </div>

            {shareLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  border: '3px solid rgba(129, 140, 248, 0.2)',
                  borderTopColor: '#818cf8',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <span style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>{t('share_uploading')}</span>
              </div>
            ) : shareError ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: '0.85rem' }}>
                  {shareError}
                </div>
                <button className="glow-btn-secondary" style={{ padding: '10px' }} onClick={() => setShowShareModal(false)}>
                  {t('btn_close')}
                </button>
              </div>
            ) : shareUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#e5e7eb',
                      fontSize: '0.85rem',
                      width: '100%',
                      outline: 'none'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="glow-btn" style={{ flex: 1, padding: '10px' }} onClick={handleCopyLink}>
                    {copied ? t('share_copied') : t('share_copy_link')}
                  </button>
                  <button className="glow-btn-secondary" style={{ padding: '10px' }} onClick={() => setShowShareModal(false)}>
                    {t('btn_close')}
                  </button>
                </div>
              </div>
            ) : null}

            {!shareLoading && !shareUrl && !shareError && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Creator Name */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#a1a1aa' }}>
                    {t('share_lbl_name')}
                  </label>
                  <input
                    type="text"
                    maxLength={32}
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    placeholder={t('share_ph_name')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      color: '#f3f4f6',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Description */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#a1a1aa' }}>
                    {t('share_lbl_desc')}
                  </label>
                  <textarea
                    maxLength={200}
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('share_ph_desc')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      color: '#f3f4f6',
                      fontSize: '0.9rem',
                      outline: 'none',
                      resize: 'none'
                    }}
                  />
                </div>

                {/* Math Puzzle (Human Check) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(99, 102, 241, 0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline' }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    {t('share_lbl_puzzle')}
                  </label>
                  <span style={{ fontSize: '0.85rem', color: '#d1d5db', margin: '4px 0' }}>
                    {t('share_puzzle_solve').replace('{a}', puzzleA.toString()).replace('{b}', puzzleB.toString())}
                  </span>
                  <input
                    type="number"
                    value={puzzleAnswer}
                    onChange={(e) => setPuzzleAnswer(e.target.value)}
                    placeholder={t('share_puzzle_ph')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      color: '#f3f4f6',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                  {captchaError && (
                    <span style={{ fontSize: '0.8rem', color: '#f87171', fontWeight: 600, marginTop: '4px' }}>
                      {t('share_err_puzzle')}
                    </span>
                  )}
                </div>

                {/* Cooldown Alert */}
                {minutesLeft !== null && minutesLeft > 0 && (
                  <p style={{ color: '#f87171', fontSize: '0.85rem', textAlign: 'center', margin: '4px 0 0 0' }}>
                    Too many shares. Please wait {minutesLeft} minute{minutesLeft !== 1 ? 's' : ''}.
                  </p>
                )}

                {/* Confirm/Cancel Buttons */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button 
                    className="glow-btn" 
                    style={{ flex: 1, padding: '10px' }} 
                    onClick={handleConfirmShare}
                    disabled={(minutesLeft !== null && minutesLeft > 0) || !puzzleAnswer}
                  >
                    {t('share_btn_confirm')}
                  </button>
                  <button className="glow-btn-secondary" style={{ flex: 1, padding: '10px' }} onClick={() => setShowShareModal(false)}>
                    {t('btn_cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
