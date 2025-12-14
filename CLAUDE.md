# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**LoRAFactory - Multi-Provider Dataset Generator** is a browser-based static web application for generating image datasets to train LoRA models (Flux 2, Z-Image, Qwen Image Edit, SDXL). It features a **multi-provider architecture** supporting FAL.ai (default) with extensibility for OpenAI, Replicate, and custom providers. It runs entirely client-side with direct API calls to selected providers.

## Architecture

### Client-Side Only (No Backend)
- Pure static web app (HTML + vanilla JS ES6 modules + CSS)
- Multi-provider abstraction layer (`api_providers.js`)
- All API calls made directly from browser to selected provider
- State management via in-memory JavaScript objects
- API key stored in localStorage (with optional AES-256 encryption)

### Multi-Provider Pattern
The app uses a **Provider Pattern** to support multiple AI providers:

**Key Files**:
- `api_providers.js` - Provider abstraction layer with base classes
- `app.js` - Main application logic using providers

**Provider Classes**:
- `ApiProvider` - Base class defining interface (abstract)
- `FalProvider` - FAL.ai implementation (default)
- `KieProvider` - Kie.ai implementation (Seedream 4.5, ~80% cheaper)
- `WisdomGateProvider` - Wisdom Gate implementation (OpenAI-compatible, full capabilities)
- `GenericProvider` - Configurable REST API wrapper for custom providers
- `ProviderManager` - Singleton managing all providers

**Provider Interface**:
```javascript
class ApiProvider {
    async setApiKey(key)
    async uploadImage(blob)
    async generateImage(params)
    async editImage(params)
    async generatePrompts(params)
    async captionImage(params)
}
```

All API calls route through: `providerManager.getActive().methodName()`

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

### Provider API Integration

**FAL.ai Provider** (default):
Uses `@fal-ai/client` SDK (imported via ESM from esm.sh):
- `fal.config({ credentials: apiKey })` - Configure API key
- `fal.subscribe(endpoint, { input })` - Make API calls (handles queuing)
- `fal.storage.upload(blob)` - Upload reference images

Key FAL endpoints:
- `fal-ai/nano-banana-pro` - Image generation
- `fal-ai/nano-banana-pro/edit` - Image editing/variations
- `fal-ai/flux-2-flex` - Flux 2 Flex with edit support
- `fal-ai/bytedance/seedream/v4.5/text-to-image` - Seedream (edit endpoint: `v4.5/edit`)
- `fal-ai/any-llm` - Prompt generation (supports multiple LLM models)
- `openrouter/router/vision` - Image captioning

**Kie.ai Provider**:
Uses Kie.ai's task-based API for Seedream 4.5:
- Base URL: `https://api.kie.ai`
- Create task: `POST /api/v1/jobs/createTask`
- Poll result: `GET /api/v1/jobs/recordInfo?taskId={taskId}`
- File upload: `POST https://kieai.redpandaai.co/api/file-stream-upload` (different domain!)

Key Kie.ai endpoints:
- `seedream/4.5-text-to-image` - Image generation
- `seedream/4.5-edit` - Image editing/variations

**Implementation details**:
- Task-based async API (create task → poll for result)
- 2-second polling interval, 60 attempts max (2-minute timeout)
- Quality mapping: '4K' → 'high', others → 'basic'
- Response: `result.outputMediaUrls[0].mediaUrl` or `result.output[0]`
- **Pricing**: 6.5 credits/image ≈ $0.032 (~80% cheaper than FAL.ai)
- **Limitation**: No LLM/vision support (use FAL.ai for those features)

**Wisdom Gate Provider**:
Uses OpenAI-compatible API with unified chat completions endpoint:
- Base URL: `https://wisdom-gate.juheapi.com/v1`
- Chat completions: `POST /v1/chat/completions` (text & image generation)
- Video generation: `POST /v1/videos` (Sora 2 Pro)
- Authorization: `Bearer {apiKey}`

Key Wisdom Gate models:
- `gemini-3-pro-image-preview` - Nano Banana Pro (image generation & editing)
- `grok-4-image` - Grok 4 Image generation
- `wisdom-ai-gpt5` - GPT-5 for LLM
- `wisdom-ai-claude-sonnet-4` - Claude Sonnet 4
- `sora-2-pro` - Video generation

**Implementation details**:
- OpenAI-compatible API (same endpoint for text & images)
- Image generation via chat completions with `image_config` parameter
- Image editing via multimodal messages (text + image_url)
- Response format: Image URL in markdown `![image](https://...)`
- Regex extraction: `/https:\/\/[^)]+\.(png|jpg|jpeg)/`
- **Reference images**: Base64 data URLs via FileReader API (no external storage needed)
- **Pricing**: 1K: ~$0.10, 2K: ~$0.13, 4K: ~$0.24 per image
- **Full capabilities**: Text-to-image, image-to-image, LLM, vision

**Custom Providers**:
Users can add custom REST API providers via UI:
- Configurable endpoints (generateImage, editImage, etc.)
- Template-based request bodies with `{{prompt}}`, `{{aspectRatio}}`, `{{resolution}}`
- JSON path for response parsing
- Stored in localStorage as `custom_providers`

### State Management

Global `state` object tracks:
- `isGenerating`: Boolean flag for generation in progress
- `pairs`: Array of generated items (in-memory only, includes `metadata` for each item)
- `pairCounter`: Sequential ID counter
- `mode`: Current generation mode ('pair' | 'single' | 'reference')
- `referenceImageUrl`: Provider storage URL for reference image
- `referenceImageBase64`: Base64 data for preview
- `imageModel`: Currently selected image generation model ID

Each item in `state.pairs` includes:
- Generation data (urls, prompts, text)
- `metadata` object: `{ model, resolution, aspectRatio, scheduler, steps }`
- `mode`: Mode used for generation

### System Prompts

Each mode has a default system prompt (`DEFAULT_SYSTEM_PROMPTS`) that instructs the LLM how to generate creative prompts. Users can customize via UI. System prompts control:
- What fields to include in JSON output
- Rules for creativity and diversity
- Mode-specific guidance (transformations, variations, etc.)

### Security Features

**API Key Protection** (app.js:160-360):
The app implements comprehensive security for API keys:

1. **AES-256-GCM Encryption**:
   - Optional password-protected encryption using Web Crypto API
   - PBKDF2 key derivation with 100,000 iterations
   - Encryption password stored in sessionStorage only
   - Functions: `encryptData()`, `decryptData()`, `deriveKey()`

2. **Storage Options**:
   - **localStorage** (default): Persistent across sessions
   - **sessionStorage**: Cleared when tab/browser closes
   - Configurable via Security Settings modal

3. **Auto-Clear Timer**:
   - Inactivity timeout (user-configurable minutes)
   - Resets on user activity (clicks, keypresses)
   - Clears key and shows alert on timeout

4. **Security Settings** (localStorage: `security_settings`):
   ```javascript
   {
       useEncryption: boolean,
       useSessionStorage: boolean,
       autoClockMinutes: number  // 0 = disabled
   }
   ```

5. **Security UI**:
   - Security Settings modal (🛡️ button)
   - Security banner with dismissible warning
   - Visual indicators for encryption status
   - Best practices recommendations

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

Required files:
- `index.html` - Main UI
- `app.js` - Application logic
- `api_providers.js` - Provider abstraction layer
- `style.css` - Styles

**Note**: All three files must be in the same directory for ES6 module imports to work.

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

- `generateSinglePair()` - Pair mode: START + END images + metadata
- `generateSingleItem()` - Single mode: One image + caption + metadata
- `generateReferenceItem()` - Reference mode: Variation of reference + metadata

All functions capture generation metadata via `getGenMetadata()`:
```javascript
{
    model: state.imageModel,
    resolution: "1K/2K/4K",
    aspectRatio: "1:1/16:9/etc",
    scheduler: "Default",
    steps: "Default"
}
```

Metadata is:
- Stored in each item in `state.pairs`
- Displayed in UI via `formatMetadataString()`
- Included in separate `_prompt.txt` files in ZIP output

### Error Handling

Uses `Promise.allSettled()` to continue generation even if individual items fail. Failed items are logged but don't stop the batch.

### Vision Captioning

Optional AI-powered image descriptions via `captionImage()`:
- Routes through active provider (FAL: uses `openrouter/router/vision`)
- Replaces action name/prompt with detailed caption
- Only runs if `useVisionCaption` is checked
- Configurable LLM model (Gemini, Claude, GPT-4o)
- Failures are caught and logged (generation continues)
- Caption stored in `.txt` files, original prompt in `_prompt.txt` files

### ZIP Generation

Uses dynamic import of JSZip from CDN:
```javascript
const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
```

**ZIP Contents**:
- Downloads all images from provider CDN URLs
- Creates caption `.txt` files (for LoRA training)
- Creates separate `_prompt.txt` files with metadata (for reference)
- Includes reference image as `reference.png` (Reference Mode only)

**Pair Mode Output**:
- `XXXX_start.png` - START image
- `XXXX_end.png` - END image
- `XXXX.txt` - Caption/action name (for training)
- `XXXX_start_prompt.txt` - START prompt + metadata
- `XXXX_edit_prompt.txt` - EDIT prompt + metadata

**Single/Reference Mode Output**:
- `XXXX.png` - Generated image
- `XXXX.txt` - Caption (for training)
- `XXXX_prompt.txt` - Generation prompt + metadata
- `reference.png` - Uploaded reference (Reference Mode only)

### Reference Image Upload

1. User selects file → FileReader reads as base64 for preview
2. On generation start → Convert base64 to Blob
3. Upload via `providerManager.getActive().uploadImage(blob)` → Get URL or data URL
4. Use URL in edit endpoint for variations
5. Include reference in ZIP output

**Provider-Specific Upload Methods**:
- **FAL.ai**: Uploads to `fal.storage.upload()` → Returns CDN URL
- **Kie.ai**: Uploads to `kieai.redpandaai.co/api/file-stream-upload` → Returns CDN URL
- **Wisdom Gate**: Converts to base64 data URL via FileReader → Returns `data:image/png;base64,...`

**Implementation**:
- `handleReferenceUpload()` - Reads file and updates preview
- `uploadReferenceImage()` - Uploads to provider (method varies by provider)
- `clearReference()` - Clears preview and state

## Configuration Options

### Image Generation Models
Models and pricing are **fetched dynamically from FAL.ai on app launch** using the `/v1/models/pricing` API endpoint.

**Model Discovery** (app.js:1505-1676):
- `fetchModelsFromFAL()` - Fetches live pricing on init
- `CURATED_MODEL_IDS` - List of supported models
- `MODEL_CONFIG` - Manual configuration for special properties (edit support, custom endpoints)
- Fallback pricing if API fetch fails

**Curated models list**:
- **Nano Banana Pro** (default) - Supports edit ✓
- **Flux 2 Flex** - Supports edit ✓
- **Seedream v4.5** - Supports edit ✓ (ByteDance, custom edit endpoint: `v4.5/edit`)
- **Flux Dev** - Open-source development
- **Flux Schnell** - Ultra-fast
- **Aura Flow** - Open-source flow-based
- **Recraft v3** - Vector art and brand styling

**Model Selection**:
- Dropdown populated via `populateImageModels()`
- Shows name, version, pricing, edit support
- Validates model compatibility with current mode
- Warns if incompatible model selected for Pair/Reference modes

**Important**:
- Pricing is pulled in real-time from FAL.ai (no hardcoded values)
- Only models with edit support can be used for Pair Mode and Reference Mode
- Single Image mode works with all models
- Some models have custom edit endpoints (e.g., Seedream)

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

## UI Features

### Result Cards with Collapsible Prompts
**Implementation** (app.js:909-1008, style.css:933-1050):

Each result card displays:
- Image(s) with lazy loading
- Collapsible prompt sections
- Individual section expand/collapse
- Copy-to-clipboard buttons
- Generation metadata display

**Prompt Sections**:
- **Pair Mode**: START Prompt, EDIT Prompt, Caption (optional)
- **Single/Reference Mode**: Generation Prompt, Caption (optional)

**Functions**:
- `addResultCard()` - Creates card HTML with prompts
- `togglePrompts()` - Toggle all prompts for a card
- `toggleSection()` - Toggle individual prompt section
- `copyPromptToClipboard()` - Copy with fallback for non-HTTPS

### Image Preview Modal
**Implementation** (app.js:1729-1757, style.css:1052-1100):

- Click any generated image to zoom
- Full-screen modal with dark overlay
- Press ESC, Space, or click background to close
- Prevents page scrolling when open

**Functions**:
- `openImagePreview(url)` - Show modal with image
- `closeImagePreview()` - Hide modal
- Global keyboard listeners for ESC/Space

### Provider Configuration UI
**Custom Provider Modal** (index.html:321-418):

Users can add custom REST API providers:
- Provider Name and ID
- API Endpoint URL
- Auth Header configuration (name, prefix)
- Request body template with variables
- Response JSON path for image URL

**Storage**: Custom providers saved in `localStorage` as `custom_providers`

## Important Constraints

1. **Max 40 items per generation**: Hard limit enforced in UI - LLM response parsing becomes unreliable beyond this
2. **In-memory only**: No persistence - users must download ZIP to save
3. **Client-side only**: No server, no database, no backend processing
4. **API key security**: Stored in localStorage (optionally encrypted with AES-256), only sent to selected provider
5. **CORS limitations**: Local file:// may not work, use HTTP server

## Modifying Generation Behavior

### To add a new AI provider:
1. Create provider class in `api_providers.js`:
   ```javascript
   export class NewProvider extends ApiProvider {
       constructor() {
           super({ id: 'new', name: 'New Provider', capabilities: [...] });
       }
       async setApiKey(key) { /* ... */ }
       async generateImage(params) { /* ... */ }
       async editImage(params) { /* ... */ }
       // Implement other required methods
   }
   ```
2. Register in `ProviderManager` constructor or via `providerManager.register()`
3. Add to provider dropdown in HTML

**OR** use Custom Provider UI:
- Users can add custom REST API providers via the "Add Custom Provider" modal
- No code changes needed - configured via UI

### To add a new generation mode:
1. Add mode button in HTML mode selector
2. Update `setMode()` to handle UI visibility
3. Add system prompt to `DEFAULT_SYSTEM_PROMPTS`
4. Add prompt generation logic in `generatePromptsWithLLM()`
5. Create generation function (e.g., `generateNewModeItem()`)
6. Add branch in `startGeneration()` batch processing

### To change default settings:
- LLM model: Change `#llmModel` select default (index.html)
- Concurrency: Change `#maxConcurrent` value (index.html)
- Vision captions: Toggle `#useVisionCaption` checked (index.html)
- Image model: Change `state.imageModel` default (app.js)

### To modify prompting behavior:
- Edit `DEFAULT_SYSTEM_PROMPTS` in app.js
- Or users can customize via UI (custom system prompt section)

## Code Style Notes

- ES6 modules with CDN imports
- Async/await for all API calls
- Global `state` object pattern
- Window-exported functions for onclick handlers
- Vanilla JS (no framework dependencies)
- Provider pattern for extensibility

## Key Enhancements in LoRAFactory

This is an enhanced fork of [NanoBanana LoRA Dataset Generator](https://github.com/lovisdotio/NanoBananaLoraDatasetGenerator) by Lovis.io with **7 major new features**:

### 1. **Multi-Provider Architecture** 🔌
- New file: `api_providers.js` (~440 lines)
- Provider abstraction layer with base class
- `FalProvider` (default), `KieProvider`, and `GenericProvider` implementations
- `ProviderManager` singleton for provider management
- **Kie.ai support**: Seedream 4.5 at ~80% cheaper than FAL.ai ($0.032 vs $0.15/image)
- Custom provider configuration via UI
- Easy to add OpenAI, Replicate, or any REST API provider

### 2. **AES-256 Encryption & Security** 🔐
- Password-protected API key encryption (PBKDF2 + AES-256-GCM)
- Session-only storage option (clears on tab close)
- Auto-clear timer with configurable inactivity timeout
- Security Settings modal with comprehensive options
- Security banner with dismissible warning
- Web Crypto API implementation (~200 lines)

### 3. **Dynamic Model Discovery with Live Pricing** 💰
- Fetches real-time pricing from FAL.ai API on app launch
- Curated model list with 7+ models
- Model metadata: version, pricing, edit support, custom endpoints
- Fallback pricing if API unavailable
- Dynamic dropdown population (~180 lines)
- Model compatibility validation for modes

### 4. **Reference Image in ZIP** 📦
- Automatically includes uploaded reference as `reference.png`
- Complete dataset package in one file
- Only for Reference Mode

### 5. **Grid View with Collapsible Prompts** 📋
- Collapsible prompt sections in result cards
- Separate sections for START/EDIT/Caption prompts
- Copy-to-clipboard buttons for each prompt
- Individual section expand/collapse
- Separate prompt files in ZIP (`_start_prompt.txt`, etc.)
- Generation metadata display (~120 lines)

### 6. **Image Preview Modal** 🖼️
- Click any image to zoom in full-screen modal
- Dark overlay, ESC/Space to close
- Prevents page scrolling when open
- Enhances UX for reviewing results

### 7. **Enhanced Model Selection UI** 🎨
- Image model dropdown with live pricing
- LLM model selection (Gemini, Claude, GPT-4o)
- Model descriptions showing capabilities
- Edit support indicators
- Compatibility warnings

**All original features preserved** (3 modes, vision captions, parallel generation, ZIP download, trigger words, custom prompts).

**File Structure**:
```
Original: app.js (927 lines)
LoRAFactory:
  ├── app.js (1,864 lines) - Main logic + enhancements
  └── api_providers.js (~440 lines) - NEW: Provider abstraction (FAL + Kie + Generic)
```

**Supported Providers**:
- ✅ **FAL.ai** - Full support (image generation, editing, LLM, vision)
- ✅ **Kie.ai** - Seedream 4.5 only (~80% cheaper, $0.032/image)
- ✅ **Wisdom Gate** - OpenAI-compatible API (full capabilities: image, LLM, vision)
- ✅ **Custom** - Add any REST API provider via UI

**Credits**: Original project by [Lovis.io](https://lovis.io) - All core functionality belongs to the original.
