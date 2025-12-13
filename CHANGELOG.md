# LoRAFactory - Complete Feature List

## Summary
LoRAFactory is an enhanced fork of [NanoBanana LoRA Dataset Generator](https://github.com/lovisdotio/NanoBananaLoraDatasetGenerator) by Lovis.io with **10 major new features** plus architectural improvements.

---

## 🆕 New Features

### 1. **Multi-Provider Architecture** 🔌
**NEW FILE**: `api_providers.js` (148 lines)

**What it does**:
- Provider abstraction layer with `ApiProvider` base class
- `FalProvider` implementation (refactored from original)
- `ProviderManager` singleton for managing providers
- Provider selector in API Key modal UI

**Why it matters**: Easy to add OpenAI, Replicate, or any AI provider without rewriting core logic.

---

### 2. **AES-256 Encryption & Security** 🔐
**NEW CODE**: Lines 104-455 in `app.js`

**Features**:
- **AES-256-GCM encryption** with PBKDF2 key derivation (100,000 iterations)
- **Password-protected** API key storage using Web Crypto API
- **Session-only storage** option (clears on tab close)
- **Auto-clear timer** with inactivity timeout
- **Security settings modal** with comprehensive options
- **Security banner** with dismissible warning

**Why it matters**: Original stored keys in plain text. Now users can encrypt with military-grade encryption.

---

### 3. **Dynamic Model Discovery with Live Pricing** �
**NEW CODE**: Lines 47-102, 1337-1520 in `app.js`

**Features**:
- **Fetches live pricing** from FAL.ai API on app launch
- **Curated model list** with 7 models (Nano Banana Pro, Flux 2 Flex, Seedream, etc.)
- **Model metadata** including version, pricing, edit support
- **Fallback pricing** if API fetch fails
- **Dynamic dropdown** population with pricing display
- **Model validation** warns if selected model doesn't support edit mode

**Why it matters**: Users see real-time pricing before generating. No hardcoded prices.

---

### 4. **Reference Image in ZIP** 📦
**NEW CODE**: Lines 1258-1271 in `app.js`

**What it does**:
- Automatically includes uploaded reference image as `reference.png` in ZIP
- Only when using Reference Mode
- Complete dataset package in one file

**Why it matters**: LoRA training requires the reference - now it's automatically included.

---

### 5. **Grid View with Collapsible Prompts** 📋
**NEW CODE**: Lines 796-920 in `app.js`

**Features**:
- **Collapsible prompt sections** in result cards
- **Separate sections** for START prompt, EDIT prompt, Caption
- **Copy-to-clipboard** buttons for each prompt
- **Toggle all prompts** button
- **Individual section** expand/collapse
- **Separate prompt files** in ZIP (`_start_prompt.txt`, `_edit_prompt.txt`)

**Why it matters**: Easy to review, copy, and debug all generated prompts without cluttering UI.

---

### 6. **Enhanced Model Selection UI** 🎨
**NEW CODE**: Lines 1580-1628 in `app.js`, Lines 89-94 in `index.html`

**Features**:
- **Image Model dropdown** with live pricing
- **LLM Model dropdown** with pricing (Gemini, Claude, GPT-4o)
- **Model descriptions** showing version and capabilities
- **Edit support indicators** ("no edit" label for incompatible models)
- **Dynamic validation** warns when selecting incompatible model for mode

**Why it matters**: Users can choose the best model for their needs with full transparency.

---

### 7. **Improved UX & Polish** ✨

**Features**:
- **Provider selector** in API Key modal
- **Footer attribution** to original creator
- **Rebranding** to LoRAFactory with factory emoji 🏭
- **Security banner** with configuration link
- **Better error messages** for model compatibility
- **Convenience scripts** (`start.sh`, `stop.sh`)
- **Proper `.gitignore`** for clean repo

---

### 8. **Dynamic Model Parameters** 🎛️
**NEW FILES**: `schema_manager.js`, `ui_generator.js`, `parameter_mapper.js`

**What it does**:
- **Fetches OpenAPI schemas** from FAL.ai for each model dynamically
- **Generates UI controls** automatically based on schema (text inputs, number sliders, dropdowns, toggles)
- **Handles union types** with preset/custom toggles (e.g., Seedream's image size)
- **Categorizes parameters** into basic/advanced/hidden sections
- **Caches schemas** locally for fast model switching
- **Fallback schemas** for known models when API is unavailable
- **Unified UI panel** consolidating model selection and parameters

**Why it matters**: No more hardcoded parameters! UI adapts automatically to each model's requirements. Users get the right controls for each model without manual configuration.

---

### 9. **Custom System Prompt Management** 💾
**NEW CODE**: Lines 2000-2200+ in `app.js`

**Features**:
- **Save prompts** with custom names, tagged by generation mode
- **Load saved prompts** from dropdown list filtered by current mode
- **Delete prompts** with confirmation
- **Export/Import** prompts as JSON files for backup and sharing
- **Persistent storage** in browser localStorage (survives browser restarts and server stops)
- **Conflict handling** when importing prompts with existing names
- **Metadata tracking** (save date, mode) for each saved prompt

**Why it matters**: Users can build a library of custom prompts for different use cases, share them between browsers/computers, and never lose their work.

---

### 10. **Chat Interface + API Stream** 💬📡
**NEW FILES**: `chat.html`, `chat.js`

**What it does**:
- Adds a dedicated chat page for prompt-to-image and reference-image editing
- Includes an **API Stream** panel that logs provider calls (request/response/error) live
- Supports **Summary** and **Verbose** logging modes with a UI toggle
- Supports drag & drop images directly onto the chat panel to set the reference image
- Adds call IDs and append-safe logging so request/response pairs don’t get dropped

**Why it matters**: Easier interactive iteration and faster debugging of provider requests.

---

## 📊 Complete Feature Comparison

| Feature | Original | LoRAFactory |
|---------|----------|-------------|
| **3 Generation Modes** | ✅ | ✅ (inherited) |
| **Vision Captions** | ✅ | ✅ (inherited) |
| **Custom System Prompts** | ✅ | ✅ (inherited) |
| **Parallel Generation** | ✅ | ✅ (inherited) |
| **ZIP Download** | ✅ | ✅ (inherited) |
| **Trigger Words** | ✅ | ✅ (inherited) |
| **Multi-Provider Architecture** | ❌ | ✅ **NEW** |
| **AES-256 Encryption** | ❌ | ✅ **NEW** |
| **Security Settings Modal** | ❌ | ✅ **NEW** |
| **Live Pricing from API** | ❌ | ✅ **NEW** |
| **Dynamic Model Discovery** | ❌ | ✅ **NEW** |
| **Reference Image in ZIP** | ❌ | ✅ **NEW** |
| **Collapsible Prompts Grid** | ❌ | ✅ **NEW** |
| **Model Selection UI** | ❌ | ✅ **NEW** |
| **Provider Selector** | ❌ | ✅ **NEW** |
| **Dynamic Model Parameters** | ❌ | ✅ **NEW** |
| **Custom Prompt Management** | ❌ | ✅ **NEW** |

---

## 🏗️ Architecture Changes

### Code Organization
```
Original:
  app.js: 927 lines (monolithic, FAL-only)

LoRAFactory:
  app.js: 2,334 lines (+1,407 lines)
  api_providers.js: 148 lines (NEW)
  schema_manager.js: ~400 lines (NEW)
  ui_generator.js: ~300 lines (NEW)
  parameter_mapper.js: ~150 lines (NEW)
```

### Line Count Breakdown
- **Multi-provider architecture**: ~200 lines
- **Security & encryption**: ~350 lines  
- **Model discovery & pricing**: ~180 lines
- **Grid view with prompts**: ~120 lines
- **Better organization & comments**: ~80 lines

---

## 📁 File Changes

### New Files
- `api_providers.js` - Provider abstraction layer
- `schema_manager.js` - OpenAPI schema fetching and parsing
- `ui_generator.js` - Dynamic UI control generation
- `parameter_mapper.js` - Parameter translation to API format
- `.gitignore` - Git exclusions
- `start.sh` / `stop.sh` - Convenience scripts
- `CHANGELOG.md` - This file
- `chat.html` - Chat page
- `chat.js` - Chat page logic

### Modified Files
- `app.js` - All new features + refactoring
- `index.html` - Provider selector, model dropdowns, security UI
- `README.md` - Updated documentation
- `style.css` - Minor tweaks (if any)

---

## 🎯 Summary

**What LoRAFactory Adds**:
1. Multi-provider architecture (extensibility)
2. AES-256 encryption & security (privacy)
3. Live pricing & model discovery (transparency)
4. Reference image in ZIP (completeness)
5. Collapsible prompts grid (usability)
6. Enhanced model selection (flexibility)
7. Better UX & polish (professionalism)
8. Dynamic model parameters (adaptability)
9. Custom prompt management (productivity)

**What it Keeps**: All original features (100%)

**Why it Matters**: More secure, more transparent, more extensible, more complete.

---

## 🙏 Credits

**Original Project**: [NanoBanana LoRA Dataset Generator](https://github.com/lovisdotio/NanoBananaLoraDatasetGenerator) by Lovis.io

All core functionality (3 modes, vision captions, parallel generation, ZIP download, trigger words, custom prompts, beautiful UI) belongs to the original project.

LoRAFactory's contribution is the 7 enhancements listed above.
