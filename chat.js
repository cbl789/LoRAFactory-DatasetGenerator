import { providerManager, GenericProvider } from './api_providers.js';
import { schemaManager } from './schema_manager.js';
import { UIGenerator } from './ui_generator.js';
import { parameterMapper } from './parameter_mapper.js';

const ENCRYPTION_CONFIG = {
    algorithm: 'AES-GCM',
    keyLength: 256,
    ivLength: 12,
    saltLength: 16,
    iterations: 100000
};

const CURATED_MODELS = [
    {
        id: 'fal-ai/nano-banana-pro',
        name: 'Nano Banana Pro',
        supportsEdit: true,
        description: "Google's state-of-the-art model with edit support"
    },
    {
        id: 'fal-ai/flux-2-flex',
        name: 'Flux 2 Flex',
        supportsEdit: true,
        description: 'Enhanced realism and native editing support'
    },
    {
        id: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
        name: 'Seedream v4.5',
        supportsEdit: true,
        editEndpoint: 'fal-ai/bytedance/seedream/v4.5/edit',
        description: 'ByteDance unified model with i2i and edit support'
    },
    {
        id: 'fal-ai/flux/dev',
        name: 'Flux Dev',
        supportsEdit: false,
        description: 'Open-source Flux model for development'
    },
    {
        id: 'fal-ai/flux/schnell',
        name: 'Flux Schnell',
        supportsEdit: false,
        description: 'Ultra-fast Flux model'
    },
    {
        id: 'fal-ai/aura-flow',
        name: 'Aura Flow',
        supportsEdit: false,
        description: 'Open-source flow-based generation'
    },
    {
        id: 'fal-ai/recraft/v3/text-to-image',
        name: 'Recraft v3',
        supportsEdit: false,
        description: 'Vector art and brand styling'
    }
];

const uiGenerator = new UIGenerator(schemaManager);

const API_LOG_MODE_KEY = 'chat_api_log_mode';

const state = {
    referenceImageBase64: null,
    referenceImageUrl: null,
    imageModel: 'fal-ai/nano-banana-pro'
};

try {
    const savedModel = localStorage.getItem('selected_image_model');
    if (savedModel) state.imageModel = savedModel;
} catch (e) {}

function getSecuritySettings() {
    const defaults = {
        useEncryption: false,
        useSessionStorage: false,
        autoClockMinutes: 0
    };
    const stored = localStorage.getItem('security_settings');
    return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
}

function getStorage() {
    const settings = getSecuritySettings();
    return settings.useSessionStorage ? sessionStorage : localStorage;
}

function bufToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBuf(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: ENCRYPTION_CONFIG.iterations,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: ENCRYPTION_CONFIG.algorithm, length: ENCRYPTION_CONFIG.keyLength },
        false,
        ['encrypt', 'decrypt']
    );
}

async function decryptData(encryptedData, password) {
    const combined = new Uint8Array(base64ToBuf(encryptedData));
    const salt = combined.slice(0, ENCRYPTION_CONFIG.saltLength);
    const iv = combined.slice(ENCRYPTION_CONFIG.saltLength, ENCRYPTION_CONFIG.saltLength + ENCRYPTION_CONFIG.ivLength);
    const encrypted = combined.slice(ENCRYPTION_CONFIG.saltLength + ENCRYPTION_CONFIG.ivLength);

    const key = await deriveKey(password, salt);

    const decrypted = await crypto.subtle.decrypt(
        { name: ENCRYPTION_CONFIG.algorithm, iv: iv },
        key,
        encrypted
    );

    return new TextDecoder().decode(decrypted);
}

async function getApiKey() {
    const settings = getSecuritySettings();
    const storage = getStorage();
    const stored = storage.getItem('fal_api_key');
    if (!stored) return '';

    if (settings.useEncryption) {
        const password = sessionStorage.getItem('encryption_password');
        if (!password) return '';
        try {
            return await decryptData(stored, password);
        } catch (e) {
            console.error('Decryption failed:', e);
            return '';
        }
    }

    return stored;
}

function loadCustomProviders() {
    try {
        const stored = localStorage.getItem('custom_providers');
        const custom = stored ? JSON.parse(stored) : [];
        custom.forEach(config => {
            try {
                const provider = new GenericProvider(config);
                providerManager.register(provider);
            } catch (e) {
                console.error('Failed to register custom provider:', config, e);
            }
        });
    } catch (e) {}
}

function setStatus(ok, text) {
    const dot = document.getElementById('chatStatusDot');
    const label = document.getElementById('chatStatusText');
    if (dot) dot.style.background = ok ? 'var(--success)' : 'var(--text-muted)';
    if (label) label.textContent = text;
}

function getApiLogMode() {
    try {
        const stored = localStorage.getItem(API_LOG_MODE_KEY);
        return stored === 'verbose' ? 'verbose' : 'summary';
    } catch (e) {
        return 'summary';
    }
}

function setApiLogMode(mode) {
    try {
        localStorage.setItem(API_LOG_MODE_KEY, mode);
    } catch (e) {}
}

function getApiLogEl() {
    return document.getElementById('apiLog');
}

function appendApiLog(entry) {
    const el = getApiLogEl();
    if (!el) return;

    const ts = new Date().toISOString().replace('T', ' ').replace('Z', '');
    el.textContent += `${ts} ${entry}\n`;
    el.scrollTop = el.scrollHeight;
}

function safeStringify(obj) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'string' && value.startsWith('data:image/')) {
            return `[data:image base64 omitted length=${value.length}]`;
        }
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[circular]';
            seen.add(value);
        }
        return value;
    }, 2);
}

function summarizePrompt(prompt) {
    if (!prompt) return '';
    const s = String(prompt).replace(/\s+/g, ' ').trim();
    return s.length > 120 ? s.slice(0, 120) + '…' : s;
}

async function callProvider(methodName, payload, { label, extraSummary } = {}) {
    const provider = providerManager.getActive();
    const providerId = providerManager.activeProviderId;
    const mode = getApiLogMode();
    const tag = label || methodName;

    const start = performance.now();
    if (mode === 'verbose') {
        appendApiLog(`[${providerId}] ${tag} -> request\n${safeStringify(payload)}`);
    } else {
        const summary = extraSummary ? ` ${extraSummary}` : '';
        appendApiLog(`[${providerId}] ${tag} -> request${summary}`);
    }

    try {
        const result = await provider[methodName](payload);
        const ms = Math.round(performance.now() - start);
        if (mode === 'verbose') {
            appendApiLog(`[${providerId}] ${tag} <- response (${ms}ms)\n${safeStringify(result)}`);
        } else {
            appendApiLog(`[${providerId}] ${tag} <- response (${ms}ms)`);
        }
        return result;
    } catch (e) {
        const ms = Math.round(performance.now() - start);
        const msg = e?.message || e?.toString?.() || 'Unknown error';
        if (mode === 'verbose') {
            appendApiLog(`[${providerId}] ${tag} <- error (${ms}ms)\n${safeStringify({ message: msg, error: e })}`);
        } else {
            appendApiLog(`[${providerId}] ${tag} <- error (${ms}ms): ${msg}`);
        }
        throw e;
    }
}

function setupApiStreamPanel() {
    const modeSelect = document.getElementById('apiLogMode');
    const clearBtn = document.getElementById('clearApiLog');
    const logEl = getApiLogEl();

    if (modeSelect) {
        modeSelect.value = getApiLogMode();
        modeSelect.addEventListener('change', () => {
            const mode = modeSelect.value === 'verbose' ? 'verbose' : 'summary';
            setApiLogMode(mode);
            appendApiLog(`[ui] log mode set to ${mode}`);
        });
    }

    if (clearBtn && logEl) {
        clearBtn.addEventListener('click', () => {
            logEl.textContent = '';
            appendApiLog('[ui] log cleared');
        });
    }
}

function openImagePreview(url) {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    modal.classList.remove('hidden');
    img.src = url;
    document.body.style.overflow = 'hidden';
}

function closeImagePreview() {
    const modal = document.getElementById('imagePreviewModal');
    modal.classList.add('hidden');
    document.getElementById('previewImage').src = '';
    document.body.style.overflow = '';
}

window.openImagePreview = openImagePreview;
window.closeImagePreview = closeImagePreview;

function addMessage({ role, text, imageUrl }) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`;

    if (text) {
        const p = document.createElement('div');
        p.className = 'chat-text';
        p.textContent = text;
        bubble.appendChild(p);
    }

    if (imageUrl) {
        const imgWrap = document.createElement('div');
        imgWrap.className = 'chat-image-wrap';
        const img = document.createElement('img');
        img.className = 'chat-image';
        img.src = imageUrl;
        img.alt = 'Generated';
        img.loading = 'lazy';
        img.onclick = () => openImagePreview(imageUrl);
        imgWrap.appendChild(img);

        const actions = document.createElement('div');
        actions.className = 'chat-image-actions';

        const link = document.createElement('a');
        link.href = imageUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Open image';
        link.className = 'chat-link';
        actions.appendChild(link);

        imgWrap.appendChild(actions);
        bubble.appendChild(imgWrap);
    }

    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

function populateProviderDropdown() {
    const select = document.getElementById('providerSelectChat');
    if (!select) return;

    const allProviders = providerManager.getAll();
    allProviders.sort((a, b) => {
        if (a.id === 'fal') return -1;
        if (b.id === 'fal') return 1;
        return a.name.localeCompare(b.name);
    });

    select.innerHTML = '';
    allProviders.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name + (p.config ? ' (Custom)' : '');
        select.appendChild(option);
    });

    select.value = providerManager.activeProviderId;

    select.onchange = async () => {
        try {
            providerManager.setActive(select.value);
            try {
                localStorage.setItem('active_provider_id', select.value);
            } catch (e) {}

            const apiKey = await getApiKey();
            try {
                await providerManager.getActive().setApiKey(apiKey);
            } catch (e) {
                console.error('Failed to configure provider with API key:', e);
            }
        } catch (e) {
            console.error(e);
        }
    };
}

async function populateImageModels() {
    const select = document.getElementById('imageModel');
    const desc = document.getElementById('imageModelDesc');
    if (!select) return;

    select.innerHTML = '';

    CURATED_MODELS.forEach(m => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = m.name + (m.supportsEdit ? '' : ' (no edit)');
        select.appendChild(option);
    });

    select.value = state.imageModel;

    const update = async (modelId) => {
        state.imageModel = modelId;
        try {
            localStorage.setItem('selected_image_model', modelId);
        } catch (e) {}

        const m = CURATED_MODELS.find(x => x.id === modelId);
        if (m && desc) desc.textContent = m.description;

        try {
            await uiGenerator.renderUI(modelId, 'modelParametersPanel');
        } catch (e) {
            console.error('Failed to render model parameters:', e);
        }
    };

    select.onchange = async (e) => {
        await update(e.target.value);
    };

    await update(state.imageModel);
}

function setupPanelToggle() {
    const toggle = document.getElementById('modelConfigToggle');
    const content = document.getElementById('modelConfigContent');
    if (!toggle || !content) return;

    toggle.addEventListener('click', () => {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? '' : 'none';
        toggle.textContent = isHidden ? '▼' : '▶';
    });
}

function setupReferenceUpload() {
    const zone = document.getElementById('chatUploadZone');
    const input = document.getElementById('referenceInput');
    const preview = document.getElementById('referencePreview');
    const placeholder = document.getElementById('chatUploadPlaceholder');
    const clearBtn = document.getElementById('clearRefBtn');

    if (!zone || !input || !preview || !placeholder || !clearBtn) return;

    const log = (...args) => console.log('[chat][reference-upload]', ...args);

    const handleFile = (file) => {
        log('handleFile', {
            hasFile: !!file,
            name: file?.name,
            type: file?.type,
            size: file?.size
        });
        if (!file) return;
        if (!file.type || !file.type.startsWith('image/')) {
            log('Rejected non-image file', { type: file?.type, name: file?.name });
            alert('Please upload an image file');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            log('FileReader onload', { resultType: typeof reader.result });
            state.referenceImageBase64 = reader.result;
            state.referenceImageUrl = null;
            preview.src = state.referenceImageBase64;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
            clearBtn.style.display = '';
        };
        reader.readAsDataURL(file);
    };

    zone.addEventListener('click', () => {
        log('zone click -> open file picker');
        input.click();
    });

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        log('dragover');
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
        log('dragleave');
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer?.files?.[0];
        log('drop', {
            hasFile: !!file,
            name: file?.name,
            type: file?.type,
            size: file?.size,
            fileCount: e.dataTransfer?.files?.length
        });
        handleFile(file);
    });

    input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        log('input change', {
            hasFile: !!file,
            name: file?.name,
            type: file?.type,
            size: file?.size,
            fileCount: input.files?.length
        });
        handleFile(file);
    });

    clearBtn.addEventListener('click', () => {
        log('clear reference image');
        state.referenceImageBase64 = null;
        state.referenceImageUrl = null;
        input.value = '';
        preview.src = '';
        preview.classList.add('hidden');
        placeholder.classList.remove('hidden');
        clearBtn.style.display = 'none';
    });
}

async function uploadReferenceIfNeeded() {
    if (!state.referenceImageBase64) return null;

    if (state.referenceImageUrl) return state.referenceImageUrl;

    const res = await fetch(state.referenceImageBase64);
    const blob = await res.blob();
    const url = await callProvider('uploadImage', blob, {
        label: 'uploadImage',
        extraSummary: `(type=${blob.type || 'unknown'} size=${blob.size}b)`
    });
    state.referenceImageUrl = url;
    return url;
}

function getModelConfig(modelId) {
    return CURATED_MODELS.find(m => m.id === modelId) || null;
}

async function generateFromChat(prompt) {
    const dynamicParams = uiGenerator.getValues();
    const aspectRatio = dynamicParams?.aspect_ratio || dynamicParams?.aspectRatio || null;
    const resolution = dynamicParams?.resolution || null;

    if (state.referenceImageBase64) {
        const modelCfg = getModelConfig(state.imageModel);
        if (modelCfg && !modelCfg.supportsEdit) {
            throw new Error(`Model ${modelCfg.name} doesn't support edit. Choose a model with edit support or clear the reference image.`);
        }

        const sourceUrl = await uploadReferenceIfNeeded();
        const mappedParams = parameterMapper.mapParameters(
            state.imageModel,
            providerManager.activeProviderId,
            dynamicParams,
            { prompt: prompt, sourceUrl }
        );

        const editEndpoint = modelCfg?.editEndpoint || `${state.imageModel}/edit`;

        const imageUrl = await callProvider('editImage', {
            sourceUrl,
            prompt,
            resolution,
            model: state.imageModel,
            editEndpoint,
            dynamicParams: mappedParams
        }, {
            label: 'editImage',
            extraSummary: `(model=${state.imageModel} prompt="${summarizePrompt(prompt)}")`
        });

        return { imageUrl, kind: 'edit' };
    }

    const mappedParams = parameterMapper.mapParameters(
        state.imageModel,
        providerManager.activeProviderId,
        dynamicParams,
        { prompt }
    );

    const imageUrl = await callProvider('generateImage', {
        prompt,
        aspectRatio,
        resolution,
        model: state.imageModel,
        dynamicParams: mappedParams
    }, {
        label: 'generateImage',
        extraSummary: `(model=${state.imageModel} prompt="${summarizePrompt(prompt)}")`
    });

    return { imageUrl, kind: 'generate' };
}

async function init() {
    loadCustomProviders();

    try {
        const savedProvider = localStorage.getItem('active_provider_id');
        if (savedProvider) providerManager.setActive(savedProvider);
    } catch (e) {}

    const apiKey = await getApiKey();

    if (!apiKey) {
        setStatus(false, 'No API Key');
        const notice = document.getElementById('chatKeyNotice');
        if (notice) notice.classList.remove('hidden');
    } else {
        setStatus(true, 'Ready');
        try {
            await providerManager.getActive().setApiKey(apiKey);
        } catch (e) {
            console.error('Failed to configure provider:', e);
        }
        schemaManager.setApiKey(apiKey);
    }

    populateProviderDropdown();
    setupApiStreamPanel();
    setupPanelToggle();
    setupReferenceUpload();
    await populateImageModels();

    const sendBtn = document.getElementById('sendBtn');
    const chatInput = document.getElementById('chatInput');

    const send = async () => {
        const text = (chatInput?.value || '').trim();
        if (!text) return;
        chatInput.value = '';

        addMessage({ role: 'user', text });

        try {
            setStatus(true, 'Generating...');
            const { imageUrl, kind } = await generateFromChat(text);
            const label = kind === 'edit' ? 'Edited image:' : 'Generated image:';
            addMessage({ role: 'assistant', text: label, imageUrl });
            setStatus(true, 'Ready');
        } catch (e) {
            addMessage({ role: 'assistant', text: `Error: ${e.message || e.toString()}` });
            setStatus(false, 'Error');
        }
    };

    if (sendBtn) sendBtn.addEventListener('click', send);

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('imagePreviewModal');
        if (modal && !modal.classList.contains('hidden')) {
            if (e.key === 'Escape' || e.key === ' ') {
                e.preventDefault();
                closeImagePreview();
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
