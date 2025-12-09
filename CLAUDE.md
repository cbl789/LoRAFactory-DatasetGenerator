# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**NanoBanana Pro LoRA Dataset Generator** is a browser-based static web application for generating image datasets to train LoRA models (Flux 2, Z-Image, Qwen Image Edit, SDXL). It runs entirely client-side and calls FAL.ai APIs directly using the official FAL client SDK.

## Architecture

### Client-Side Only (No Backend)
- Pure static web app (HTML + vanilla JS + CSS)
- All API calls made directly from browser to FAL.ai
- State management via in-memory JavaScript objects
- API key stored in localStorage

### Three Generation Modes

1. **Pair Mode** (default): Generates START → END image pairs for training image editing models
   - Uses `fal-ai/nano-banana-pro` to generate START image
   - Uses `fal-ai/nano-banana-pro/edit` to transform START → END
   - Output: `XXXX_start.png`, `XXXX_end.png`, `XXXX.txt`

2. **Single Image Mode**: Generates standalone images for style/aesthetic LoRAs
   - Uses `fal-ai/nano-banana-pro` to generate images
   - Output: `XXXX.png`, `XXXX.txt`

3. **Reference Image Mode**: Generates variations of an uploaded reference image
   - Uploads reference via `fal.storage.upload()`
   - Uses `fal-ai/nano-banana-pro/edit` to create variations
   - Output: `XXXX.png`, `XXXX.txt`

### Generation Pipeline

```
User Input (theme + config)
    ↓
LLM Prompt Generation (fal-ai/any-llm)
    - Generates creative base prompts + edit instructions
    - Returns JSON array of prompt objects
    ↓
Parallel Image Generation (configurable concurrency)
    - Batch processing with Promise.allSettled
    - Default: 3 concurrent, max: 10
    ↓
Optional Vision Captions (openrouter/router/vision)
    - Describes generated images with AI
    ↓
In-Memory Storage (state.pairs array)
    ↓
ZIP Download (JSZip from CDN)
```

### FAL API Integration

Uses `@fal-ai/client` SDK (imported via ESM from esm.sh):
- `fal.config({ credentials: apiKey })` - Configure API key
- `fal.subscribe(endpoint, { input })` - Make API calls (handles queuing)
- `fal.storage.upload(blob)` - Upload reference images

Key endpoints:
- `fal-ai/nano-banana-pro` - Image generation
- `fal-ai/nano-banana-pro/edit` - Image editing/variations
- `fal-ai/any-llm` - Prompt generation (supports multiple models)
- `openrouter/router/vision` - Image captioning

### State Management

Global `state` object tracks:
- `isGenerating`: Boolean flag for generation in progress
- `pairs`: Array of generated items (in-memory only)
- `pairCounter`: Sequential ID counter
- `mode`: Current generation mode ('pair' | 'single' | 'reference')
- `referenceImageUrl`: FAL storage URL for reference image
- `referenceImageBase64`: Base64 data for preview

### System Prompts

Each mode has a default system prompt (`DEFAULT_SYSTEM_PROMPTS`) that instructs the LLM how to generate creative prompts. Users can customize via UI. System prompts control:
- What fields to include in JSON output
- Rules for creativity and diversity
- Mode-specific guidance (transformations, variations, etc.)

## Running the Application

### Local Development

**Option 1: Direct file open** (may have CORS issues):
```bash
open index.html
```

**Option 2: Python HTTP server** (recommended):
```bash
python -m http.server 3000
# Open http://localhost:3000
```

**Option 3: Node.js**:
```bash
npx serve .
```

### Deployment

Deploy as static files to:
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

Required files: `index.html`, `app.js`, `style.css`

## Key Implementation Details

### Parallel Generation with Batching

Images are generated in batches (controlled by `maxConcurrent`):
```javascript
for (let i = 0; i < prompts.length; i += maxConcurrent) {
    const batch = prompts.slice(i, Math.min(i + maxConcurrent, prompts.length));
    const results = await Promise.allSettled(
        batch.map((p, batchIndex) => generateSinglePair(...))
    );
}
```

### Mode-Specific Generation Functions

- `generateSinglePair()` - Pair mode: START + END images
- `generateSingleItem()` - Single mode: One image + caption
- `generateReferenceItem()` - Reference mode: Variation of reference

### Error Handling

Uses `Promise.allSettled()` to continue generation even if individual items fail. Failed items are logged but don't stop the batch.

### Vision Captioning

Optional AI-powered image descriptions:
- Replaces action name/prompt with detailed caption
- Only runs if `useVisionCaption` is checked
- Failures are caught and logged (generation continues)

### ZIP Generation

Uses dynamic import of JSZip from CDN:
```javascript
const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
```

Downloads all images from FAL CDN URLs, packages with .txt files, generates ZIP blob.

### Reference Image Upload

1. User selects file → FileReader reads as base64 for preview
2. On generation start → Convert base64 to Blob
3. Upload to FAL storage → Get CDN URL
4. Use URL in edit endpoint for variations

## Configuration Options

### Image Generation Models
Models and pricing are **fetched dynamically from FAL.ai on app launch** using the `/v1/models/pricing` API endpoint.

**Curated models list**:
- **Nano Banana Pro** (default) - Supports edit ✓
- **Flux 2 Flex** - Supports edit ✓
- **Seedream v4.5** - Supports edit ✓ (ByteDance unified i2i and edit)
- **Flux Dev** - Open-source development
- **Flux Schnell** - Ultra-fast
- **Aura Flow** - Open-source flow-based
- **Recraft v3** - Vector art and brand styling

**Important**:
- Pricing is pulled in real-time from FAL.ai (no hardcoded values)
- Only models with edit support (Nano Banana Pro, Flux 2 Flex, Seedream) can be used for Pair Mode and Reference Mode
- Single Image mode works with all models
- If API fetch fails, falls back to Nano Banana Pro

### LLM Models (for prompt generation and vision captions)
- `google/gemini-2.5-flash` - Fast, cheap (default) - $0.075/$0.30 per 1M tokens (input/output)
- `google/gemini-2.5-pro` - Better quality - $1.25/$5.00 per 1M tokens (input/output)
- `anthropic/claude-3.5-sonnet` - High quality - $3.00/$15.00 per 1M tokens (input/output)
- `openai/gpt-4o` - High quality - $2.50/$10.00 per 1M tokens (input/output)

**Note**: Prices as of December 2024 via OpenRouter (includes markup). Some models may have compatibility issues with the OpenRouter vision endpoint - if you encounter errors with vision captions, try switching to GPT-4o.

### Resolution Options
- 1K: Lower cost, faster
- 2K: Standard quality
- 4K: High quality (may cost more for some models)

### Generation Limits
- Max 40 items per generation (LLM parsing limitation)
- No storage limit (in-memory only until download)
- Users can run multiple generations to accumulate more

## Important Constraints

1. **Max 40 items per generation**: Hard limit enforced in UI - LLM response parsing becomes unreliable beyond this
2. **In-memory only**: No persistence - users must download ZIP to save
3. **Client-side only**: No server, no database, no backend processing
4. **API key security**: Stored in localStorage, only sent to FAL
5. **CORS limitations**: Local file:// may not work, use HTTP server

## Modifying Generation Behavior

### To add a new generation mode:
1. Add mode button in HTML (line 104-118)
2. Update `setMode()` to handle UI visibility
3. Add system prompt to `DEFAULT_SYSTEM_PROMPTS`
4. Add prompt generation logic in `generatePromptsWithLLM()`
5. Create generation function (e.g., `generateNewModeItem()`)
6. Add branch in `startGeneration()` batch processing

### To change default settings:
- LLM model: Change `#llmModel` select default (index.html:80-85)
- Concurrency: Change `#maxConcurrent` value (index.html:180)
- Vision captions: Toggle `#useVisionCaption` checked (index.html:72)

### To modify prompting behavior:
- Edit `DEFAULT_SYSTEM_PROMPTS` in app.js:23-45
- Or users can customize via UI (custom system prompt section)

## Code Style Notes

- ES6 modules with CDN imports
- Async/await for all API calls
- Global `state` object pattern
- Window-exported functions for onclick handlers
- Vanilla JS (no framework dependencies)
