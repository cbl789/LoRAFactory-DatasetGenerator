# 🍌 NanoBanana Pro LoRA Dataset Generator

> **Create training datasets for image editing models in minutes!**
> 
> Uses **FAL.ai API** with **Nano Banana Pro** to generate high-quality image pairs for training **Flux 2**, **Z-Image**, **Qwen Image Edit**, and other image-to-image models.

![NanoBanana Pro LoRA Dataset Generator](screenshot.png)

## 🔗 Links

- **🚀 Live Demo**: [lovis.io/NanoBananaLoraDatasetGenerator](https://lovis.io/NanoBananaLoraDatasetGenerator)
- **💻 Source Code**: [github.com/lovisdotio/NanoBananaLoraDatasetGenerator](https://github.com/lovisdotio/NanoBananaLoraDatasetGenerator)

---

## ✨ Features

- **Zero server setup** - Runs entirely in your browser
- **Direct FAL API calls** - Talks to FAL servers directly
- **Parallel generation** - Generate multiple pairs simultaneously
- **ZIP download** - Download your complete dataset as a ZIP file
- **Vision captions** - AI-powered image descriptions
- **Trigger word support** - Add custom prefixes to your training data

## 🚀 Quick Start

### Option 1: Local (Double-click)
Simply open `index.html` in your browser!

> ⚠️ Some browsers block local file API calls. If it doesn't work, use Option 2.

### Option 2: Local Server (Recommended)
```bash
cd dist
python -m http.server 3000
# Open http://localhost:3000
```

Or with Node.js:
```bash
npx serve dist
```

### Option 3: Host Online (Free)
Upload these 3 files to any static hosting:
- **GitHub Pages** - Free, just push to a repo
- **Netlify** - Drag & drop the `dist` folder
- **Vercel** - Connect your repo
- **Cloudflare Pages** - Free tier available

## 📁 Files

```
dist/
├── index.html    # Main page
├── app.js        # Application logic (calls FAL API directly)
├── style.css     # Styling
└── README.md     # This file
```

## 🔑 API Key

1. Get your free API key at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)
2. Click the 🔑 button in the app
3. Enter your key and save

**Security**: Your key is stored ONLY in your browser's localStorage. It's never sent anywhere except directly to FAL's servers.

## 💰 Pricing (FAL)

| Resolution | Cost per image |
|------------|----------------|
| 1K | $0.15 |
| 2K | $0.15 |
| 4K | $0.30 |

Vision captions: ~$0.002 per image

**Example**: 20 pairs × 2 images × $0.15 = ~$6.00

## 🎯 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     YOUR BROWSER                            │
│                                                             │
│  1. Enter theme + transformation                            │
│  2. AI generates creative prompts (via FAL LLM)            │
│  3. Generate START images (via FAL nano-banana-pro)        │
│  4. Generate END images (via FAL nano-banana-pro/edit)     │
│  5. Optional: Vision captions (via FAL OpenRouter)         │
│  6. Download as ZIP                                         │
│                                                             │
│  ════════════════════════════════════════════════════════   │
│                          │                                  │
│                          ▼                                  │
│                    FAL API SERVERS                          │
│                  (All processing here)                      │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Output Format

The ZIP file contains:
```
nanobanana_dataset_TIMESTAMP.zip
├── 0001_start.png    # Starting image
├── 0001_end.png      # Transformed image
├── 0001.txt          # Action description / caption
├── 0002_start.png
├── 0002_end.png
├── 0002.txt
└── ...
```

This format is compatible with:
- **Flux 2** - LoRA fine-tuning
- **Z-Image** - Image editing training
- **Qwen Image Edit** - Instruction-based editing
- **SDXL** - Fine-tuning and LoRA
- **Any image-to-image model** - Universal format

## ⚙️ Configuration

| Setting | Description |
|---------|-------------|
| **Theme** | What kind of images to generate (e.g., "portraits of diverse people") |
| **Transformation** | What change to learn (e.g., "zoom out from close-up to full body") |
| **Action Name** | Optional - AI generates one if empty |
| **Trigger Word** | Optional - Prepended to all .txt files (e.g., "MYZOOM") |
| **Pairs** | Number of image pairs to generate |
| **Parallel** | How many to generate simultaneously (1-10) |
| **Resolution** | 1K, 2K, or 4K |
| **Vision Captions** | Use AI to describe the END image |

## 🔧 Customization

### Change LLM Model
Edit `app.js` line ~150:
```javascript
const llmModel = document.getElementById('llmModel').value;
```

Available models:
- `google/gemini-2.5-flash` (fast, cheap)
- `google/gemini-2.5-pro` (better quality)
- `anthropic/claude-3.5-sonnet` (excellent quality)
- `openai/gpt-4o` (excellent quality)

### Change Parallel Requests
Default is 3. Increase for faster generation (but may hit rate limits):
```html
<input type="number" id="maxConcurrent" value="5" min="1" max="10">
```

## 🐛 Troubleshooting

### "Failed to fetch" errors
- Check your API key is valid
- Check you have credits on FAL
- Try reducing parallel requests to 1

### CORS errors when opening locally
Use a local server instead of double-clicking:
```bash
python -m http.server 3000
```

### Generation is slow
- Increase parallel requests (up to 5-10)
- Use 1K resolution instead of 4K
- Disable vision captions for faster generation

## 📜 License

MIT - Use freely for any purpose.

## 🙏 Credits

- **FAL.ai** - GPU infrastructure and models
- **NanoBanana Pro** - Image generation model
- **OpenRouter** - LLM routing for prompts and captions

---

Made with 🍌 for the AI art community

