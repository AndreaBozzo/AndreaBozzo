#!/bin/bash
# Build script per Andrea Bozzo Portfolio
# Minifica CSS/JS e copia index.prod.html -> index.html

set -e  # Exit on error

echo "🚀 Starting build process..."

# Colori per output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check dependencies
echo -e "${BLUE}📦 Checking dependencies...${NC}"
if ! command -v npx &> /dev/null; then
    echo -e "${RED}❌ npx not found. Please install Node.js${NC}"
    exit 1
fi

# Minify JavaScript
echo -e "${BLUE}🔧 Minifying JavaScript...${NC}"
npx -y terser assets/main.js -o assets/main.min.js \
    --compress \
    --mangle \
    --comments false

JS_ORIGINAL=$(wc -c < assets/main.js)
JS_MINIFIED=$(wc -c < assets/main.min.js)
JS_SAVED=$((JS_ORIGINAL - JS_MINIFIED))
JS_PERCENT=$((JS_SAVED * 100 / JS_ORIGINAL))

echo -e "${GREEN}✅ JavaScript: ${JS_ORIGINAL} bytes → ${JS_MINIFIED} bytes (saved ${JS_PERCENT}%)${NC}"

# Minify CSS
echo -e "${BLUE}🎨 Minifying CSS...${NC}"
npx -y clean-css-cli assets/styles.css -o assets/styles.min.css

CSS_ORIGINAL=$(wc -c < assets/styles.css)
CSS_MINIFIED=$(wc -c < assets/styles.min.css)
CSS_SAVED=$((CSS_ORIGINAL - CSS_MINIFIED))
CSS_PERCENT=$((CSS_SAVED * 100 / CSS_ORIGINAL))

echo -e "${GREEN}✅ CSS: ${CSS_ORIGINAL} bytes → ${CSS_MINIFIED} bytes (saved ${CSS_PERCENT}%)${NC}"

# Copy production HTML to index.html
echo -e "${BLUE}📄 Deploying production HTML...${NC}"
cp index.prod.html index.html
echo -e "${GREEN}✅ index.html updated with production version${NC}"

# Calculate total savings
TOTAL_SAVED=$((JS_SAVED + CSS_SAVED))
TOTAL_ORIGINAL=$((JS_ORIGINAL + CSS_ORIGINAL))
TOTAL_PERCENT=$((TOTAL_SAVED * 100 / TOTAL_ORIGINAL))

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 Build completed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Total saved: ${TOTAL_SAVED} bytes (${TOTAL_PERCENT}%)${NC}"
echo -e "${BLUE}Files ready for deployment:${NC}"
echo "  - index.html (production)"
echo "  - assets/main.min.js"
echo "  - assets/styles.min.css"
echo "  - sw.js (Service Worker)"
echo "  - manifest.json (PWA)"
echo ""
echo -e "${BLUE}💡 Deploy with: git add . && git commit && git push${NC}"
