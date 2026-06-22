# SkinBridge 🚀

**SkinBridge** is a premium interactive web platform designed for creators. It allows you to transform Minecraft skins (64x64 px) into 3D models ready for editing software (such as Blender or Blockbench) and official **Roblox Classic** clothing templates (Shirt and Pants) with real-time 3D preview.

🔗 **Official Website:** [https://minecraft-to-roblox-clothing-export.vercel.app/](https://minecraft-to-roblox-clothing-export.vercel.app/)

---

## 🌟 Key Features

### 1. Control Panel & Analytics (SaaS Dashboard)
* **Centralized Entry Point:** A modern dashboard to explore available workspaces and monitor usage trends.
* **Real-Time Metrics & Analytics:** Track skin conversions, exported files, your favorite format, and your most-used workspace.
* **Dynamic Charts:** Interactive SVG pie chart displaying workspace distribution, and a horizontal bar chart showing the most popular export formats.
* **Recent Activity Log:** Chronological list of your last 5 actions (uploads, visits, and exports) with relative timestamps.
* **Data Persistence:** All analytics and activity logs are automatically persisted locally via `localStorage`.

### 2. 3D Head Model Workspace (`head3d`)
Convert your Minecraft skin's head into a 3D blocky model with layered volume support (Base Layer + Hat/Outer Layer).
* **Interactive 3D Viewer:** Inspect the model in a sleek dark environment with 360° orbital rotation, smooth zooming, helper grid, and auto-rotation.
* **Face Breakdown:** A 2D grid featuring all 12 head faces cropped in real-time according to official Minecraft skin coordinates.
* **Supported Export Formats:**
  * **GLB:** Download the 3D model as a `.glb` binary file compatible with Blender, Unity, or Unreal Engine.
  * **BBMODEL (Blockbench):** Export a structured model file with hierarchical folders, native editable cubes, and embedded textures.
  * **OBJ:** Export as a wave-front `.obj` file along with its `.mtl` material file and `textura.png`.
  * **FBX:** Export as a `.fbx` model file with embedded materials.

### 3. Roblox Classic Clothing Converter (`roblox`)
Convert the torso, arms, and legs of your Minecraft skin into official Roblox Classic clothing templates (585x559 px).
* **Arm Type Selector (Steve vs. Alex):** Automatically detects if the skin format is Classic (4px arms) or Slim (3px arms), and provides manual toggle buttons to easily correct any auto-detection mistakes in real-time.
* **3D Roblox Avatar Preview (R6 Dummy):** Full-body interactive 3D viewer that applies the generated shirt (`shirt.png`) and pants (`pants.png`) textures onto a Roblox R6 rig. Includes orbital camera controls and a quick-reset button to return to the frontal camera view.
* **Anatomically Correct UV Remapping:** Maps Minecraft skin coordinates (torso, arms, legs) to official Roblox classic clothing templates, ensuring all limbs and sides are correctly oriented to prevent textures from rendering backwards or upside-down.
* **2D Avatar View Assembly:** Sidebar previews showing the clothing assembled on a 2D dummy from four distinct view angles (**Front**, **Back**, **Left**, **Right**).
* **Pixel-Perfect Scaling:** Employs nearest-neighbor scaling to maintain the sharpness of the original pixel art on both templates and 3D viewers.
* **Quick Downloads:** Single-click buttons to download templates individually or both sequentially.

### 4. Multilingual Support (i18n)
* **Automatic Detection:** Automatically detects your browser's language, setting English (`en`, default) or Spanish (`es`) accordingly.
* **Dynamic Language Switcher:** A header selector allows you to translate the entire UI in real-time without reloading the page.
* **Preferences Storage:** Remembers your language preference across browser sessions.

### 5. Responsive Ad Banners
* **Sponsor Banner Columns (160x600 px):** Integrates "Wide Skyscraper" sponsor panels on the sides of the viewport, styled to match the frosted glass aesthetic of the app.
* **Non-Intrusive Design:** Sidebar banners hide automatically using CSS media queries (`@media`) on screen widths below `1600px` to maximize space for 3D viewports on laptops and mobile devices.
* **Session-Dismissible:** Banners feature a close button to permanently hide them during your session.

---

## 🛠️ Technology Stack

* **Framework:** React 19 + TypeScript + Vite
* **3D Graphics:** Three.js with OrbitControls, OBJExporter, GLTFExporter, and FBXExporter integrations
* **Iconography:** Lucide React
* **Styling:** Vanilla CSS with dynamic gradients and Glassmorphism
* **Image Processing:** 2D Canvas API for real-time pixel cropping and nearest-neighbor scaling
* **Bundle Optimization:** Code Splitting using `React.lazy` and `Suspense` to reduce the initial bundle footprint by **80%** (from 1.12 MB down to **225 kB**).

---

## 🔗 Supabase Backend Configuration

SkinBridge relies on Supabase for public sharing functionality, image uploads, and dashboard history feeds. All shared items are automatically configured to expire and delete after exactly 7 days.

To set up the backend database and storage:
1. **Create a Supabase Project:** Sign up at [supabase.com](https://supabase.com) and create a new project.
2. **Execute Database Schema:** Navigate to the **SQL Editor** in your Supabase dashboard and run the entire script found in [supabase_schema.sql](file:///c:/minecraft-to-roblox-clothing-exporter/supabase_schema.sql).
3. **Configure Storage:**
   - Go to **Storage** and create a new bucket named `conversions`.
   - Set the bucket to **Public** so anyone can view shared images.
   - Add a storage policy for the `INSERT` operation to allow anonymous uploads (documented inside `supabase_schema.sql`).
4. **Environment Variables:**
   - Copy `.env.example` to a new file named `.env`.
   - Replace the values of `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with your project's credentials (found under Project Settings > API).

---

## 💻 Local Installation and Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/NestorSnIbz/minecraft-to-roblox-clothing-exporter.git
   cd minecraft-to-roblox-clothing-exporter
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:5173`.

4. **Build for production:**
   ```bash
   npm run build
   ```
   This compiles the project and generates optimized assets split into chunks on-demand inside the `dist/` directory.
