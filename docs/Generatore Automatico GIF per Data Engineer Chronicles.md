# 🤖 Generatore Automatico GIF per Data Engineer Chronicles

> Genera la tua GIF animata con un singolo comando!

## 📋 Soluzioni Disponibili

1. **[Docker Solution](#docker-solution)** - Zero dipendenze, funziona ovunque
2. **[Python Script](#python-script)** - Con Playwright per automazione browser
3. **[GitHub Action](#github-action)** - Genera automaticamente su push
4. **[One-Click Script](#one-click)** - Setup completo automatizzato

---

## 🐳 Docker Solution (Raccomandato)

### File 1: `Dockerfile`

```dockerfile
FROM node:18-slim

# Install dependencies for Puppeteer and ffmpeg
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    chromium \
    ffmpeg \
    imagemagick \
    gifsicle \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy files
COPY package.json ./
COPY generate-gif.js ./
COPY assets/animations/data-engineer.html ./animation.html

# Install Node dependencies
RUN npm install puppeteer gifencoder png-file-stream

# Run the generator
CMD ["node", "generate-gif.js"]
```

### File 2: `generate-gif.js`

```javascript
const puppeteer = require('puppeteer');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');

// Configuration
const CONFIG = {
    width: 900,
    height: 650,
    fps: 10,
    duration: 70, // seconds - enough for all scenes
    outputPath: './assets/data-engineer-chronicles.gif',
    quality: 85,
    colors: 256
};

async function generateGif() {
    console.log('🚀 Starting GIF generation...');
    
    try {
        // Launch browser
        console.log('📦 Launching headless browser...');
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ],
            defaultViewport: {
                width: CONFIG.width,
                height: CONFIG.height
            }
        });

        const page = await browser.newPage();
        
        // Load the HTML animation
        console.log('📄 Loading animation HTML...');
        const htmlPath = `file://${path.resolve(__dirname, 'animation.html')}`;
        await page.goto(htmlPath, { waitUntil: 'networkidle0' });
        
        // Wait for animation to start
        await page.waitForTimeout(2000);
        
        // Create frames directory
        const framesDir = './frames';
        if (!fs.existsSync(framesDir)) {
            fs.mkdirSync(framesDir);
        }
        
        // Calculate frame count
        const frameCount = CONFIG.fps * CONFIG.duration;
        const frameDelay = 1000 / CONFIG.fps;
        
        console.log(`📸 Capturing ${frameCount} frames...`);
        
        // Capture frames
        for (let i = 0; i < frameCount; i++) {
            const paddedNumber = String(i).padStart(5, '0');
            await page.screenshot({
                path: `${framesDir}/frame_${paddedNumber}.png`,
                clip: {
                    x: 0,
                    y: 0,
                    width: CONFIG.width,
                    height: CONFIG.height
                }
            });
            
            // Progress indicator
            if (i % 10 === 0) {
                const progress = Math.round((i / frameCount) * 100);
                console.log(`  Progress: ${progress}% (${i}/${frameCount} frames)`);
            }
            
            await page.waitForTimeout(frameDelay);
        }
        
        await browser.close();
        console.log('✅ Frame capture complete!');
        
        // Convert frames to GIF using ffmpeg
        console.log('🎬 Converting frames to GIF...');
        
        // Step 1: Create initial GIF with ffmpeg
        const ffmpegCmd = `ffmpeg -y -framerate ${CONFIG.fps} \
            -pattern_type glob -i '${framesDir}/frame_*.png' \
            -filter_complex "[0:v] fps=${CONFIG.fps},scale=${CONFIG.width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${CONFIG.colors}:stats_mode=single[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" \
            temp.gif`;
        
        await execPromise(ffmpegCmd);
        console.log('✅ Initial GIF created!');
        
        // Step 2: Optimize with gifsicle
        console.log('🔧 Optimizing GIF size...');
        const gifsicleCmd = `gifsicle -O3 --lossy=${CONFIG.quality} \
            --colors ${CONFIG.colors} \
            --resize-width 800 \
            temp.gif -o ${CONFIG.outputPath}`;
        
        await execPromise(gifsicleCmd);
        console.log('✅ GIF optimization complete!');
        
        // Cleanup
        console.log('🧹 Cleaning up temporary files...');
        await execPromise(`rm -rf ${framesDir} temp.gif`);
        
        // Get final file size
        const stats = fs.statSync(CONFIG.outputPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        console.log('');
        console.log('🎉 SUCCESS! GIF generated successfully!');
        console.log(`📁 Output: ${CONFIG.outputPath}`);
        console.log(`📊 Size: ${fileSizeMB} MB`);
        console.log(`📐 Dimensions: ${CONFIG.width}x${CONFIG.height}`);
        console.log(`⏱️ FPS: ${CONFIG.fps}`);
        
        if (fileSizeMB > 10) {
            console.log('⚠️  Warning: GIF is larger than 10MB. Consider reducing quality or dimensions.');
        }
        
    } catch (error) {
        console.error('❌ Error generating GIF:', error);
        process.exit(1);
    }
}

// Run the generator
generateGif();
```

### File 3: `package.json`

```json
{
  "name": "data-engineer-gif-generator",
  "version": "1.0.0",
  "description": "Automatic GIF generator for Data Engineer Chronicles",
  "main": "generate-gif.js",
  "scripts": {
    "generate": "node generate-gif.js",
    "docker:build": "docker build -t gif-generator .",
    "docker:run": "docker run -v $(pwd)/assets:/app/assets gif-generator",
    "generate:docker": "npm run docker:build && npm run docker:run"
  },
  "dependencies": {
    "puppeteer": "^21.0.0"
  }
}
```

### File 4: `docker-compose.yml` (Opzionale)

```yaml
version: '3.8'

services:
  gif-generator:
    build: .
    volumes:
      - ./assets:/app/assets
      - ./assets/animations:/app/animations
    environment:
      - WIDTH=800
      - HEIGHT=600
      - FPS=10
      - DURATION=70
      - QUALITY=85
```

---

## 🐍 Python Script Solution

### File: `generate_gif.py`

```python
#!/usr/bin/env python3
"""
Data Engineer Chronicles GIF Generator
Requires: playwright, Pillow, imageio
"""

import asyncio
import os
import shutil
from pathlib import Path
from typing import List
import subprocess

from playwright.async_api import async_playwright
from PIL import Image
import imageio
import numpy as np

class GifGenerator:
    def __init__(self, 
                 width: int = 900,
                 height: int = 650,
                 fps: int = 10,
                 duration: int = 70,
                 output_path: str = "assets/data-engineer-chronicles.gif"):
        self.width = width
        self.height = height
        self.fps = fps
        self.duration = duration
        self.output_path = output_path
        self.frames_dir = Path("frames")
        
    async def capture_frames(self) -> List[Path]:
        """Capture frames from the HTML animation"""
        print("🚀 Starting GIF generation...")
        
        # Create frames directory
        self.frames_dir.mkdir(exist_ok=True)
        
        async with async_playwright() as p:
            # Launch browser
            print("📦 Launching browser...")
            browser = await p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox']
            )
            
            # Create page with specific viewport
            context = await browser.new_context(
                viewport={'width': self.width, 'height': self.height}
            )
            page = await context.new_page()
            
            # Load HTML
            print("📄 Loading animation...")
            html_path = Path("assets/animations/data-engineer.html").absolute()
            await page.goto(f"file://{html_path}")
            await page.wait_for_timeout(2000)  # Wait for animation to start
            
            # Calculate frames
            total_frames = self.fps * self.duration
            frame_delay = 1000 / self.fps
            frames = []
            
            print(f"📸 Capturing {total_frames} frames...")
            
            # Capture frames
            for i in range(total_frames):
                frame_path = self.frames_dir / f"frame_{i:05d}.png"
                await page.screenshot(path=str(frame_path))
                frames.append(frame_path)
                
                # Progress indicator
                if i % 10 == 0:
                    progress = (i / total_frames) * 100
                    print(f"  Progress: {progress:.1f}% ({i}/{total_frames})")
                
                await page.wait_for_timeout(frame_delay)
            
            await browser.close()
            
        print("✅ Frame capture complete!")
        return frames
    
    def optimize_frames(self, frames: List[Path]) -> List[Image.Image]:
        """Optimize frames for GIF creation"""
        print("🔧 Optimizing frames...")
        
        optimized = []
        for i, frame_path in enumerate(frames):
            if i % 20 == 0:
                print(f"  Processing frame {i}/{len(frames)}")
            
            # Open and resize image
            img = Image.open(frame_path)
            
            # Resize if needed (to reduce file size)
            if img.width > 800:
                ratio = 800 / img.width
                new_height = int(img.height * ratio)
                img = img.resize((800, new_height), Image.Resampling.LANCZOS)
            
            # Convert to palette mode for better compression
            img = img.convert('P', palette=Image.ADAPTIVE, colors=256)
            optimized.append(img)
        
        return optimized
    
    def create_gif(self, frames: List[Image.Image]):
        """Create the final GIF"""
        print("🎬 Creating GIF...")
        
        # Save as GIF using imageio
        imageio.mimsave(
            self.output_path,
            [np.array(frame) for frame in frames],
            fps=self.fps,
            loop=0
        )
        
        print("✅ GIF created!")
        
        # Optimize with gifsicle if available
        if shutil.which('gifsicle'):
            print("🔧 Optimizing with gifsicle...")
            subprocess.run([
                'gifsicle', '-O3', '--lossy=80',
                '--colors', '256',
                self.output_path,
                '-o', self.output_path
            ])
            print("✅ Optimization complete!")
    
    def cleanup(self):
        """Clean up temporary files"""
        print("🧹 Cleaning up...")
        shutil.rmtree(self.frames_dir, ignore_errors=True)
    
    async def generate(self):
        """Main generation process"""
        try:
            # Capture frames
            frames_paths = await self.capture_frames()
            
            # Optimize frames
            frames_images = self.optimize_frames(frames_paths)
            
            # Create GIF
            self.create_gif(frames_images)
            
            # Cleanup
            self.cleanup()
            
            # Report results
            file_size = os.path.getsize(self.output_path) / (1024 * 1024)
            print("\n🎉 SUCCESS!")
            print(f"📁 Output: {self.output_path}")
            print(f"📊 Size: {file_size:.2f} MB")
            
            if file_size > 10:
                print("⚠️  Warning: GIF larger than 10MB")
                
        except Exception as e:
            print(f"❌ Error: {e}")
            raise

async def main():
    """Entry point"""
    generator = GifGenerator()
    await generator.generate()

if __name__ == "__main__":
    # Install playwright browsers if needed
    os.system("playwright install chromium")
    
    # Run generator
    asyncio.run(main())
```

### File: `requirements.txt`

```txt
playwright==1.40.0
Pillow==10.1.0
imageio==2.33.0
numpy==1.24.3
```

### File: `setup.sh`

```bash
#!/bin/bash
# Setup script for Python solution

echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

echo "🌐 Installing Playwright browsers..."
playwright install chromium
playwright install-deps

echo "✅ Setup complete! Run: python generate_gif.py"
```

---

## 🤖 GitHub Action Solution

### File: `.github/workflows/generate-gif.yml`

```yaml
name: Generate GIF Animation

on:
  push:
    paths:
      - 'assets/animations/data-engineer.html'
  workflow_dispatch:
    inputs:
      width:
        description: 'GIF width in pixels'
        required: false
        default: '800'
      fps:
        description: 'Frames per second'
        required: false
        default: '10'

jobs:
  generate-gif:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout repository
      uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install system dependencies
      run: |
        sudo apt-get update
        sudo apt-get install -y \
          chromium-browser \
          ffmpeg \
          gifsicle \
          imagemagick
    
    - name: Install Node dependencies
      run: |
        npm init -y
        npm install puppeteer
    
    - name: Generate GIF
      run: |
        cat > generate.js << 'EOF'
        const puppeteer = require('puppeteer');
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        const fs = require('fs');
        const path = require('path');
        
        (async () => {
          const width = parseInt(process.env.WIDTH || '800');
          const fps = parseInt(process.env.FPS || '10');
          
          console.log('Generating GIF...');
          
          const browser = await puppeteer.launch({
            headless: 'new',
            executablePath: '/usr/bin/chromium-browser',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          });
          
          const page = await browser.newPage();
          await page.setViewport({ width, height: 600 });
          
          const htmlPath = path.resolve('assets/animations/data-engineer.html');
          await page.goto(`file://${htmlPath}`);
          
          // Create frames directory
          await execPromise('mkdir -p frames');
          
          // Capture frames (60 seconds of animation)
          const totalFrames = fps * 60;
          for (let i = 0; i < totalFrames; i++) {
            await page.screenshot({ 
              path: `frames/frame_${String(i).padStart(5, '0')}.png` 
            });
            await page.waitForTimeout(1000 / fps);
            
            if (i % 10 === 0) {
              console.log(`Progress: ${Math.round((i/totalFrames)*100)}%`);
            }
          }
          
          await browser.close();
          
          // Convert to GIF
          console.log('Converting to GIF...');
          await execPromise(`ffmpeg -y -framerate ${fps} -pattern_type glob -i 'frames/*.png' -vf "fps=${fps},scale=${width}:-1:flags=lanczos" temp.gif`);
          
          // Optimize
          console.log('Optimizing...');
          await execPromise('gifsicle -O3 --lossy=80 --colors 256 temp.gif -o assets/data-engineer-chronicles.gif');
          
          // Cleanup
          await execPromise('rm -rf frames temp.gif');
          
          const size = (fs.statSync('assets/data-engineer-chronicles.gif').size / (1024*1024)).toFixed(2);
          console.log(`✅ GIF generated: ${size}MB`);
        })();
        EOF
        
        WIDTH=${{ github.event.inputs.width || '800' }} \
        FPS=${{ github.event.inputs.fps || '10' }} \
        node generate.js
    
    - name: Commit GIF
      run: |
        git config --local user.email "action@github.com"
        git config --local user.name "GitHub Action"
        git add assets/data-engineer-chronicles.gif
        git diff --staged --quiet || git commit -m "🎬 Auto-generated GIF animation"
    
    - name: Push changes
      uses: ad-m/github-push-action@master
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        branch: ${{ github.ref }}
```

---

## 🚀 One-Click Setup Script

### File: `setup-and-generate.sh`

```bash
#!/bin/bash
# Complete setup and generation script

set -e

echo "🚀 Data Engineer Chronicles - GIF Generator Setup"
echo "================================================"

# Check OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    OS="windows"
else
    echo "❌ Unsupported OS"
    exit 1
fi

echo "📍 Detected OS: $OS"

# Function to install dependencies
install_deps() {
    echo "📦 Installing dependencies..."
    
    if [[ "$OS" == "linux" ]]; then
        sudo apt-get update
        sudo apt-get install -y nodejs npm ffmpeg gifsicle
    elif [[ "$OS" == "mac" ]]; then
        # Check for Homebrew
        if ! command -v brew &> /dev/null; then
            echo "Installing Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        brew install node ffmpeg gifsicle
    else
        echo "⚠️  Windows detected. Please install manually:"
        echo "  - Node.js: https://nodejs.org/"
        echo "  - FFmpeg: https://ffmpeg.org/download.html"
        echo "  - Gifsicle: https://www.lcdf.org/gifsicle/"
        exit 1
    fi
}

# Function to setup project
setup_project() {
    echo "📁 Setting up project structure..."
    
    # Create directories
    mkdir -p assets/animations
    mkdir -p assets
    
    # Check if HTML exists
    if [ ! -f "assets/animations/data-engineer.html" ]; then
        echo "❌ Animation HTML not found!"
        echo "Please add your data-engineer.html to assets/animations/"
        exit 1
    fi
    
    # Install Node packages
    echo "📦 Installing Node packages..."
    npm init -y &> /dev/null
    npm install puppeteer
}

# Function to generate GIF
generate_gif() {
    echo "🎬 Generating GIF..."
    
    # Create the generation script
    cat > generate-gif.js << 'SCRIPT'
const puppeteer = require('puppeteer');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs');
const path = require('path');

const CONFIG = {
    width: 800,
    height: 600,
    fps: 10,
    duration: 70
};

(async () => {
    try {
        console.log('🚀 Starting GIF generation...');
        
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setViewport({ 
            width: CONFIG.width, 
            height: CONFIG.height 
        });
        
        const htmlPath = path.resolve('assets/animations/data-engineer.html');
        await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
        await page.waitForTimeout(2000);
        
        // Create frames directory
        if (!fs.existsSync('frames')) {
            fs.mkdirSync('frames');
        }
        
        const totalFrames = CONFIG.fps * CONFIG.duration;
        
        console.log(`📸 Capturing ${totalFrames} frames...`);
        
        for (let i = 0; i < totalFrames; i++) {
            await page.screenshot({
                path: `frames/frame_${String(i).padStart(5, '0')}.png`
            });
            
            if (i % 10 === 0) {
                const progress = Math.round((i / totalFrames) * 100);
                process.stdout.write(`\r  Progress: ${progress}%`);
            }
            
            await page.waitForTimeout(1000 / CONFIG.fps);
        }
        
        console.log('\n✅ Frames captured!');
        
        await browser.close();
        
        console.log('🎬 Converting to GIF...');
        
        // Create GIF with ffmpeg
        await execPromise(`ffmpeg -y -framerate ${CONFIG.fps} \
            -pattern_type glob -i 'frames/*.png' \
            -vf "fps=${CONFIG.fps},scale=${CONFIG.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
            temp.gif 2>/dev/null`);
        
        console.log('🔧 Optimizing GIF...');
        
        // Optimize with gifsicle
        await execPromise(`gifsicle -O3 --lossy=80 --colors 256 \
            temp.gif -o assets/data-engineer-chronicles.gif`);
        
        // Cleanup
        await execPromise('rm -rf frames temp.gif');
        
        const stats = fs.statSync('assets/data-engineer-chronicles.gif');
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        console.log('\n🎉 SUCCESS!');
        console.log(`📁 GIF saved to: assets/data-engineer-chronicles.gif`);
        console.log(`📊 File size: ${sizeMB} MB`);
        
        if (sizeMB > 10) {
            console.log('⚠️  Warning: GIF is larger than 10MB');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
})();
SCRIPT
    
    # Run the generator
    node generate-gif.js
    
    # Clean up
    rm generate-gif.js
}

# Main execution
main() {
    echo ""
    echo "Choose an option:"
    echo "1) Install dependencies only"
    echo "2) Generate GIF (dependencies already installed)"
    echo "3) Full setup and generation"
    echo ""
    read -p "Enter choice (1-3): " choice
    
    case $choice in
        1)
            install_deps
            setup_project
            echo "✅ Setup complete! Run option 2 to generate GIF"
            ;;
        2)
            generate_gif
            ;;
        3)
            install_deps
            setup_project
            generate_gif
            ;;
        *)
            echo "❌ Invalid choice"
            exit 1
            ;;
    esac
}

# Run main function
main
```

---

## 🎯 Quick Start

### Metodo più veloce (Docker):

```bash
# 1. Assicurati di avere Docker installato
# 2. Nella root del tuo progetto:

# Build e genera in un comando
docker build -t gif-gen . && docker run -v $(pwd)/assets:/app/assets gif-gen

# La GIF sarà in assets/data-engineer-chronicles.gif
```

### Metodo alternativo (Script):

```bash
# 1. Rendi eseguibile lo script
chmod +x setup-and-generate.sh

# 2. Esegui
./setup-and-generate.sh

# 3. Scegli opzione 3 per setup completo
```

---

## ⚙️ Personalizzazione

Modifica questi parametri nei file per personalizzare:

| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| `width` | 800px | Larghezza GIF |
| `height` | 600px | Altezza GIF |
| `fps` | 10 | Frame per secondo |
| `duration` | 70s | Durata registrazione |
| `colors` | 256 | Numero colori |
| `quality` | 80 | Qualità (0-100) |

---

## 📊 Ottimizzazione Dimensioni

Per ridurre le dimensioni della GIF:

```bash
# Metodo 1: Riduci risoluzione
width: 600  # invece di 800

# Metodo 2: Riduci FPS
fps: 8  # invece di 10

# Metodo 3: Aumenta compressione
quality: 60  # invece di 80
colors: 128  # invece di 256

# Metodo 4: Riduci durata
duration: 50  # invece di 70
```

---

## ✨ Features

- ✅ **Zero dipendenze manuali** con Docker
- ✅ **Multi-piattaforma** (Linux, Mac, Windows con WSL)
- ✅ **Ottimizzazione automatica** con gifsicle
- ✅ **Progress bar** durante generazione
- ✅ **Controllo qualità** e dimensioni
- ✅ **GitHub Action** per CI/CD
- ✅ **Cleanup automatico** file temporanei

---

## 🐛 Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| "Chromium not found" | Installa con: `npx playwright install chromium` |
| "ffmpeg not found" | Linux: `sudo apt install ffmpeg`, Mac: `brew install ffmpeg` |
| GIF troppo grande | Riduci width a 600px o fps a 8 |
| Frames mancanti | Aumenta duration per catturare tutte le scene |
| Docker permission denied | Usa `sudo` o aggiungi user al gruppo docker |

---

## 🎉 Success!

Una volta generata la GIF, aggiungila al tuo README:

```markdown
![Data Engineer Life](./assets/data-engineer-chronicles.gif)
```

Enjoy your automated GIF generation! 🚀