/**
 * LoRAFactory - Multi-Provider Dataset Generator
 * Uses Provider Pattern for Multi-Vendor Support
 */

import { providerManager, GenericProvider } from './api_providers.js';
import { schemaManager } from './schema_manager.js';
import { UIGenerator } from './ui_generator.js';
import { parameterMapper } from './parameter_mapper.js';

// =============================================================================
// Dynamic Parameters Management
// =============================================================================

// Initialize UIGenerator
const uiGenerator = new UIGenerator(schemaManager);

// =============================================================================
// Custom Provider Management
// =============================================================================

function getCustomProviders() {
    const stored = localStorage.getItem('custom_providers');
    return stored ? JSON.parse(stored) : [];
}

function saveCustomProviders(providers) {
    localStorage.setItem('custom_providers', JSON.stringify(providers));
    // Reload to register
    loadCustomProviders();
}

function loadCustomProviders() {
    const custom = getCustomProviders();
    // Register each
    custom.forEach(config => {
        try {
            const provider = new GenericProvider(config);
            providerManager.register(provider);
        } catch (e) {
            console.error('Failed to register custom provider:', config, e);
        }
    });
    // Refresh UI if modal is open
    populateProviderDropdown();
}

function addCustomProvider(config) {
    const providers = getCustomProviders();
    // Check for duplicate ID
    const existingIndex = providers.findIndex(p => p.id === config.id);
    if (existingIndex >= 0) {
        providers[existingIndex] = config; // Update
    } else {
        providers.push(config); // Add
    }
    saveCustomProviders(providers);
}

function deleteCustomProvider(id) {
    const providers = getCustomProviders();
    const filtered = providers.filter(p => p.id !== id);
    saveCustomProviders(filtered);
    providerManager.unregister(id);
    // If active was deleted, switch to default
    if (providerManager.activeProviderId === id) {
        providerManager.setActive('fal');
    }
}


// =============================================================================
// State
// =============================================================================

const state = {
    isGenerating: false,
    pairs: [], // Store generated pairs/images in memory
    pairCounter: 0,
    mode: 'pair', // 'pair', 'single', or 'reference'
    referenceImageUrl: null, // URL of uploaded reference image
    referenceImageBase64: null, // Base64 of uploaded reference image
    imageModel: 'fal-ai/nano-banana-pro' // Selected image generation model
};

try {
    const savedModel = localStorage.getItem('selected_image_model');
    if (savedModel) state.imageModel = savedModel;
} catch (e) {}

// Default system prompts for each mode
const DEFAULT_SYSTEM_PROMPTS = {
    pair: `You are a creative prompt engineer for AI image generation. Generate diverse, detailed prompts for creating training data.

RULES:
1. Each prompt must be unique and creative
2. base_prompt: Detailed description for generating the START image
3. edit_prompt: Instruction for transforming START → END image
4. action_name: Short identifier for this transformation type`,

    single: `You are a creative prompt engineer for AI image generation. Generate diverse, detailed prompts for creating style/aesthetic training data.

RULES:
1. Each prompt must be unique and creative
2. prompt: Detailed description capturing the desired aesthetic, style, composition, lighting, and mood
3. Focus on visual consistency and aesthetic qualities that define the style`,

    reference: `You are a creative prompt engineer for AI image generation. Generate diverse prompts for creating variations of a reference image.

RULES:
1. Each prompt must be unique while maintaining consistency with the reference
2. prompt: Detailed description for generating a variation that preserves key elements of the reference
3. Vary poses, angles, backgrounds, lighting, and contexts while keeping the subject recognizable`
};

// Image models list (populated dynamically from FAL API)
let IMAGE_MODELS = [
    // Fallback models if API fetch fails
    {
        id: 'fal-ai/nano-banana-pro',
        name: 'Nano Banana Pro',
        version: '1.0',
        pricing: '$0.15/image',
        supportsEdit: true,
        description: 'Google\'s state-of-the-art model'
    }
];

// Models we want to fetch (curated list)
const CURATED_MODEL_IDS = [
    'fal-ai/nano-banana-pro',
    'fal-ai/flux-2-flex',
    'fal-ai/bytedance/seedream/v4.5/text-to-image',
    'fal-ai/flux/dev',
    'fal-ai/flux/schnell',
    'fal-ai/aura-flow',
    'fal-ai/recraft/v3/text-to-image'
];

// Manual configuration for models with special properties
const MODEL_CONFIG = {
    'fal-ai/nano-banana-pro': {
        supportsEdit: true,
        description: 'Google\'s state-of-the-art model with edit support'
    },
    'fal-ai/flux-2-flex': {
        supportsEdit: true,
        description: 'Enhanced realism and native editing support'
    },
    'fal-ai/bytedance/seedream/v4.5/text-to-image': {
        supportsEdit: true,
        editEndpoint: 'fal-ai/bytedance/seedream/v4.5/edit',
        description: 'ByteDance unified model with i2i and edit support'
    },
    'fal-ai/flux/dev': {
        supportsEdit: false,
        description: 'Open-source Flux model for development'
    },
    'fal-ai/flux/schnell': {
        supportsEdit: false,
        description: 'Ultra-fast Flux model'
    },
    'fal-ai/aura-flow': {
        supportsEdit: false,
        description: 'Open-source flow-based generation'
    },
    'fal-ai/recraft/v3/text-to-image': {
        supportsEdit: false,
        description: 'Vector art and brand styling'
    }
};

// =============================================================================
// Security & Encryption Utilities
// =============================================================================

const ENCRYPTION_CONFIG = {
    algorithm: 'AES-GCM',
    keyLength: 256,
    ivLength: 12,
    saltLength: 16,
    iterations: 100000
};

// Derive encryption key from password using PBKDF2
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

// Encrypt data with password
async function encryptData(data, password) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.saltLength));
    const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.ivLength));
    const key = await deriveKey(password, salt);

    const encrypted = await crypto.subtle.encrypt(
        { name: ENCRYPTION_CONFIG.algorithm, iv: iv },
        key,
        enc.encode(data)
    );

    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
}

// Decrypt data with password
async function decryptData(encryptedBase64, password) {
    try {
        const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

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
    } catch (e) {
        throw new Error('Decryption failed - incorrect password or corrupted data');
    }
}

// =============================================================================
// API Key Management
// =============================================================================

// Security settings stored in localStorage
function getSecuritySettings() {
    const defaults = {
        useEncryption: false,
        useSessionStorage: false,
        autoClockMinutes: 0 // 0 = disabled
    };
    const stored = localStorage.getItem('security_settings');
    return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
}

function setSecuritySettings(settings) {
    localStorage.setItem('security_settings', JSON.stringify(settings));
}

// Get the appropriate storage
function getStorage() {
    const settings = getSecuritySettings();
    return settings.useSessionStorage ? sessionStorage : localStorage;
}

// Get stored API key (decrypt if needed)
async function getApiKey() {
    const settings = getSecuritySettings();
    const storage = getStorage();
    const stored = storage.getItem('fal_api_key');

    if (!stored) return '';

    if (settings.useEncryption) {
        // Key is encrypted, need password
        const password = sessionStorage.getItem('encryption_password');
        if (!password) {
            return ''; // Password not in session, need to re-enter
        }
        try {
            return await decryptData(stored, password);
        } catch (e) {
            console.error('Decryption failed:', e);
            return '';
        }
    }

    return stored;
}

// Set API key (encrypt if needed)
async function setApiKey(key, password = null) {
    const settings = getSecuritySettings();
    const storage = getStorage();

    if (!key) {
        storage.removeItem('fal_api_key');
        sessionStorage.removeItem('encryption_password');
        // Clear in provider
        try {
            providerManager.getActive().setApiKey(null);
        } catch (e) { }
        return;
    }

    if (settings.useEncryption) {
        if (!password) {
            throw new Error('Password required for encryption');
        }
        const encrypted = await encryptData(key, password);
        storage.setItem('fal_api_key', encrypted);
        // Store password in session for this session
        sessionStorage.setItem('encryption_password', password);
    } else {
        storage.setItem('fal_api_key', key);
    }

    // Configure Active Provider with the key
    await providerManager.getActive().setApiKey(key);

    // Setup auto-clear if enabled
    setupAutoClear();
}

// Auto-clear functionality
let autoClearTimer = null;

function setupAutoClear() {
    const settings = getSecuritySettings();

    // Clear existing timer
    if (autoClearTimer) {
        clearTimeout(autoClearTimer);
        autoClearTimer = null;
    }

    // Setup new timer if enabled
    if (settings.autoClockMinutes > 0) {
        const ms = settings.autoClockMinutes * 60 * 1000;
        autoClearTimer = setTimeout(() => {
            clearApiKeyFromMemory();
            alert('⏰ API key cleared due to inactivity');
            updateStatus(false, 'Key cleared (inactivity)');
        }, ms);
    }
}

// Reset auto-clear timer on activity
function resetAutoClearTimer() {
    const settings = getSecuritySettings();
    if (settings.autoClockMinutes > 0) {
        setupAutoClear();
    }
}

// Clear API key from memory
function clearApiKeyFromMemory() {
    getStorage().removeItem('fal_api_key');
    sessionStorage.removeItem('encryption_password');
}

// Populate the provider dropdown
function populateProviderDropdown() {
    const select = document.getElementById('providerSelect');
    if (!select) return;

    // Save current selection if possible
    const current = providerManager.activeProviderId;

    select.innerHTML = '';

    // Get all providers
    const allProviders = providerManager.getAll(); // Method we added to ProviderManager

    // Sort: FAL first, then others alphabetically
    allProviders.sort((a, b) => {
        if (a.id === 'fal') return -1;
        if (b.id === 'fal') return 1;
        return a.name.localeCompare(b.name);
    });

    allProviders.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name + (p.config ? ' (Custom)' : '');
        select.appendChild(option);
    });

    // Restore selection or default to fal
    select.value = current;

    // Handle change immediately to update UI/Keys
    select.onchange = async () => {
        try {
            providerManager.setActive(select.value);
            try {
                localStorage.setItem('active_provider_id', select.value);
            } catch (e) {}
            // Reload key for this provider
            const key = await getApiKey();
            try {
                await providerManager.getActive().setApiKey(key);
            } catch (e) {
                console.error('Failed to configure provider with API key:', e);
            }
            document.getElementById('apiKeyInput').value = key || '';

            // Update UI description if possible
            const label = document.getElementById('apiKeyLabel');
            label.textContent = `${select.options[select.selectedIndex].text} API Key`;
        } catch (e) {
            console.error(e);
        }
    };
}

function showApiKeyModal() {
    document.getElementById('apiKeyModal').classList.remove('hidden');
    populateProviderDropdown();
    loadApiKeyIntoModal();
}

async function loadApiKeyIntoModal() {
    const input = document.getElementById('apiKeyInput');
    const passwordSection = document.getElementById('encryptionPasswordSection');
    const settings = getSecuritySettings();
    const label = document.getElementById('apiKeyLabel');

    // Update Label based on active provider
    const active = providerManager.getActive();
    label.textContent = `${active.name} API Key`;

    // Show/hide password field based on encryption setting
    if (settings.useEncryption) {
        passwordSection.classList.remove('hidden');
    } else {
        passwordSection.classList.add('hidden');
    }

    // Load existing key if available
    const key = await getApiKey();
    input.value = key;
    input.focus();
}

function hideApiKeyModal() {
    document.getElementById('apiKeyModal').classList.add('hidden');
    document.getElementById('encryptionPassword').value = '';
}

function toggleKeyVisibility() {
    const input = document.getElementById('apiKeyInput');
    const icon = document.getElementById('keyVisibilityIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = '🙈';
    } else {
        input.type = 'password';
        icon.textContent = '👁️';
    }
}

async function saveApiKey() {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!key) {
        alert('Please enter an API key');
        return;
    }

    const settings = getSecuritySettings();
    let password = null;

    if (settings.useEncryption) {
        password = document.getElementById('encryptionPassword').value;
        if (!password || password.length < 8) {
            alert('⚠️ Please enter a password (minimum 8 characters) to encrypt your API key');
            return;
        }
    }

    try {
        await setApiKey(key, password);
        // Update schema manager with API key
        schemaManager.setApiKey(key);
        hideApiKeyModal();
        const storageType = settings.useSessionStorage ? 'session' : 'persistent';
        const encrypted = settings.useEncryption ? ' (encrypted)' : '';
        updateStatus(true, `API Key Saved ${encrypted}`);

        // Show confirmation with security info
        const messages = [
            '✅ API key saved successfully',
            `🔒 Storage: ${storageType}${encrypted}`
        ];
        if (settings.useSessionStorage) {
            messages.push('ℹ️ Key will be cleared when you close this tab');
        }
        if (settings.autoClockMinutes > 0) {
            messages.push(`⏰ Auto-clear in ${settings.autoClockMinutes} minutes of inactivity`);
        }
        alert(messages.join('\n'));

    } catch (error) {
        alert('❌ Error saving API key: ' + error.message);
    }
}

async function clearApiKey() {
    if (confirm('⚠️ Clear your API key?\n\nThis will remove it from storage immediately.')) {
        await setApiKey('');
        document.getElementById('apiKeyInput').value = '';
        document.getElementById('encryptionPassword').value = '';
        updateStatus(false, 'No API Key');
    }
}

// Show security settings modal
function showSecuritySettings() {
    document.getElementById('securitySettingsModal').classList.remove('hidden');

    // Load current settings
    const settings = getSecuritySettings();
    document.getElementById('useEncryption').checked = settings.useEncryption;
    document.getElementById('useSessionStorage').checked = settings.useSessionStorage;
    document.getElementById('autoClockMinutes').value = settings.autoClockMinutes || '';
}

function hideSecuritySettings() {
    document.getElementById('securitySettingsModal').classList.add('hidden');
}

async function saveSecuritySettings() {
    const settings = {
        useEncryption: document.getElementById('useEncryption').checked,
        useSessionStorage: document.getElementById('useSessionStorage').checked,
        autoClockMinutes: parseInt(document.getElementById('autoClockMinutes').value) || 0
    };

    const oldSettings = getSecuritySettings();

    // If encryption or storage type changed, need to re-save key
    if (settings.useEncryption !== oldSettings.useEncryption ||
        settings.useSessionStorage !== oldSettings.useSessionStorage) {

        const hasKey = await getApiKey();
        if (hasKey) {
            if (!confirm('⚠️ Changing security settings requires re-entering your API key.\n\nYour current key will be cleared. Continue?')) {
                return;
            }
            await setApiKey(''); // Clear old key
        }
    }

    setSecuritySettings(settings);
    hideSecuritySettings();
    alert('✅ Security settings updated!\n\n' +
        (settings.useEncryption !== oldSettings.useEncryption ||
            settings.useSessionStorage !== oldSettings.useSessionStorage
            ? 'Please re-enter your API key.' : 'Settings saved.'));

    if (settings.useEncryption !== oldSettings.useEncryption ||
        settings.useSessionStorage !== oldSettings.useSessionStorage) {
        showApiKeyModal();
    }

    // Setup auto-clear with new settings
    setupAutoClear();
}

function dismissSecurityBanner() {
    document.getElementById('securityBanner').style.display = 'none';
    localStorage.setItem('security_banner_dismissed', 'true');
}

// =============================================================================
// Mode Management
// =============================================================================

function setMode(mode) {
    state.mode = mode;

    // Update UI buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Show/hide transformation section (only for pair mode)
    const transformSection = document.getElementById('transformationSection');
    const actionSection = document.getElementById('actionNameSection');
    const referenceSection = document.getElementById('referenceUploadSection');

    if (mode === 'pair') {
        transformSection.classList.remove('hidden');
        actionSection.classList.remove('hidden');
        referenceSection.classList.add('hidden');
        document.getElementById('pairOrImageLabel').textContent = 'Pairs';
        document.getElementById('countLabel').textContent = 'pairs in memory';
        document.getElementById('progressLabel').textContent = 'pairs';
    } else if (mode === 'single') {
        transformSection.classList.add('hidden');
        actionSection.classList.add('hidden');
        referenceSection.classList.add('hidden');
        document.getElementById('pairOrImageLabel').textContent = 'Images';
        document.getElementById('countLabel').textContent = 'images in memory';
        document.getElementById('progressLabel').textContent = 'images';
    } else if (mode === 'reference') {
        transformSection.classList.add('hidden');
        actionSection.classList.add('hidden');
        referenceSection.classList.remove('hidden');
        document.getElementById('pairOrImageLabel').textContent = 'Images';
        document.getElementById('countLabel').textContent = 'images in memory';
        document.getElementById('progressLabel').textContent = 'images';
    }

    // Update cost estimate
    updateCostEstimate();

    // Update default system prompt placeholder
    updateSystemPromptPlaceholder();
    updateSavedPromptsList(); // Refresh saved prompts list when mode changes
}

function updateSystemPromptPlaceholder() {
    const textarea = document.getElementById('customSystemPrompt');
    textarea.placeholder = DEFAULT_SYSTEM_PROMPTS[state.mode];
}

function toggleSystemPrompt() {
    const section = document.getElementById('systemPromptSection');
    const icon = document.getElementById('systemPromptIcon');
    const isHidden = section.classList.contains('hidden');

    section.classList.toggle('hidden');
    icon.textContent = isHidden ? '▼' : '▶';
}

function resetSystemPrompt() {
    document.getElementById('customSystemPrompt').value = '';
    document.getElementById('promptNameInput').value = '';
    updateSavedPromptsList();
}

function getSystemPrompt() {
    const custom = document.getElementById('customSystemPrompt').value.trim();
    return custom || DEFAULT_SYSTEM_PROMPTS[state.mode];
}

// =============================================================================
// System Prompt Storage
// =============================================================================

function getSavedPrompts() {
    try {
        const saved = localStorage.getItem('saved_system_prompts');
        return saved ? JSON.parse(saved) : {};
    } catch (e) {
        console.error('Failed to load saved prompts:', e);
        return {};
    }
}

function saveSavedPrompts(prompts) {
    try {
        localStorage.setItem('saved_system_prompts', JSON.stringify(prompts));
    } catch (e) {
        console.error('Failed to save prompts:', e);
        alert('Failed to save prompt. Check console for details.');
    }
}

function saveSystemPrompt() {
    const name = document.getElementById('promptNameInput').value.trim();
    const prompt = document.getElementById('customSystemPrompt').value.trim();
    
    if (!name) {
        alert('Please enter a name for this prompt.');
        return;
    }
    
    if (!prompt) {
        alert('Please enter a prompt to save.');
        return;
    }
    
    const saved = getSavedPrompts();
    saved[name] = {
        prompt: prompt,
        mode: state.mode,
        savedAt: new Date().toISOString()
    };
    
    saveSavedPrompts(saved);
    updateSavedPromptsList();
    document.getElementById('promptNameInput').value = '';
    
    // Show confirmation
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Saved!';
    btn.style.background = 'var(--success)';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
    }, 2000);
}

function loadSavedPrompt() {
    const select = document.getElementById('savedPromptSelect');
    const name = select.value;
    
    if (!name) {
        alert('Please select a saved prompt to load.');
        return;
    }
    
    const saved = getSavedPrompts();
    const savedPrompt = saved[name];
    
    if (!savedPrompt) {
        alert('Prompt not found.');
        updateSavedPromptsList();
        return;
    }
    
    document.getElementById('customSystemPrompt').value = savedPrompt.prompt;
    document.getElementById('promptNameInput').value = name;
    
    // Show confirmation
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Loaded!';
    btn.style.background = 'var(--success)';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
    }, 1500);
}

function deleteSavedPrompt() {
    const select = document.getElementById('savedPromptSelect');
    const name = select.value;
    
    if (!name) {
        alert('Please select a prompt to delete.');
        return;
    }
    
    if (!confirm(`Delete saved prompt "${name}"?`)) {
        return;
    }
    
    const saved = getSavedPrompts();
    delete saved[name];
    saveSavedPrompts(saved);
    updateSavedPromptsList();
    select.value = '';
    
    // Clear inputs if the deleted prompt was loaded
    if (document.getElementById('promptNameInput').value === name) {
        document.getElementById('customSystemPrompt').value = '';
        document.getElementById('promptNameInput').value = '';
    }
}

function updateSavedPromptsList() {
    const select = document.getElementById('savedPromptSelect');
    const saved = getSavedPrompts();
    
    // Clear existing options except the first one
    select.innerHTML = '<option value="">-- Select saved prompt --</option>';
    
    // Sort by name
    const names = Object.keys(saved).sort();
    
    names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        const savedPrompt = saved[name];
        const date = new Date(savedPrompt.savedAt).toLocaleDateString();
        const modeLabel = savedPrompt.mode || 'unknown';
        option.textContent = `${name} (${modeLabel}, ${date})`;
        select.appendChild(option);
    });
}

function exportSystemPrompts() {
    const saved = getSavedPrompts();
    
    if (Object.keys(saved).length === 0) {
        alert('No saved prompts to export.');
        return;
    }
    
    const dataStr = JSON.stringify(saved, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `system-prompts-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Show confirmation
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Exported!';
    btn.style.background = 'var(--success)';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
    }, 2000);
}

function importSystemPrompts(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            
            if (typeof imported !== 'object' || Array.isArray(imported)) {
                throw new Error('Invalid format');
            }
            
            // Validate structure
            for (const [name, data] of Object.entries(imported)) {
                if (!data.prompt || typeof data.prompt !== 'string') {
                    throw new Error(`Invalid prompt data for "${name}"`);
                }
            }
            
            // Merge with existing (ask user)
            const existing = getSavedPrompts();
            const importedNames = Object.keys(imported);
            const existingNames = Object.keys(existing);
            const conflicts = importedNames.filter(name => existingNames.includes(name));
            
            if (conflicts.length > 0) {
                const overwrite = confirm(
                    `Found ${conflicts.length} prompt(s) with existing names:\n${conflicts.join(', ')}\n\n` +
                    `Click OK to overwrite existing prompts, or Cancel to skip conflicts.`
                );
                
                if (overwrite) {
                    // Merge all
                    const merged = { ...existing, ...imported };
                    saveSavedPrompts(merged);
                } else {
                    // Only add new ones
                    const merged = { ...existing };
                    importedNames.forEach(name => {
                        if (!existingNames.includes(name)) {
                            merged[name] = imported[name];
                        }
                    });
                    saveSavedPrompts(merged);
                }
            } else {
                // No conflicts, merge all
                const merged = { ...existing, ...imported };
                saveSavedPrompts(merged);
            }
            
            updateSavedPromptsList();
            
            // Show confirmation
            alert(`Successfully imported ${importedNames.length} prompt(s)!`);
            
        } catch (error) {
            console.error('Import error:', error);
            alert(`Failed to import prompts: ${error.message}\n\nPlease ensure the file is valid JSON with the correct format.`);
        }
        
        // Reset file input
        event.target.value = '';
    };
    
    reader.onerror = function() {
        alert('Failed to read file.');
        event.target.value = '';
    };
    
    reader.readAsText(file);
}

// =============================================================================
// Reference Image Upload
// =============================================================================

function handleReferenceUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        state.referenceImageBase64 = e.target.result;

        // Show preview
        const preview = document.getElementById('referencePreview');
        const placeholder = document.getElementById('uploadPlaceholder');
        const clearBtn = document.getElementById('clearRefBtn');

        preview.src = e.target.result;
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
        clearBtn.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function clearReference() {
    state.referenceImageBase64 = null;
    state.referenceImageUrl = null;

    const preview = document.getElementById('referencePreview');
    const placeholder = document.getElementById('uploadPlaceholder');
    const clearBtn = document.getElementById('clearRefBtn');
    const input = document.getElementById('referenceInput');

    preview.classList.add('hidden');
    preview.src = '';
    placeholder.classList.remove('hidden');
    clearBtn.style.display = 'none';
    input.value = '';
}

// Upload reference image to Provider storage
async function uploadReferenceImage() {
    if (!state.referenceImageBase64) return null;

    // Convert base64 to blob
    const response = await fetch(state.referenceImageBase64);
    const blob = await response.blob();

    // Upload via active provider
    try {
        const url = await providerManager.getActive().uploadImage(blob);
        state.referenceImageUrl = url;
        return url;
    } catch (e) {
        console.error("Upload failed:", e);
        throw e;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// Image Generation
// =============================================================================

async function generateStartImage(prompt, aspectRatio, resolution) {
    // Get dynamic parameters from UI
    const dynamicParams = uiGenerator.getValues();
    
    // Map parameters for the current provider
    const mappedParams = parameterMapper.mapParameters(
        state.imageModel,
        providerManager.activeProviderId,
        dynamicParams,
        { prompt: prompt }
    );

    return await providerManager.getActive().generateImage({
        prompt: prompt,
        aspectRatio: aspectRatio,
        resolution: resolution,
        model: state.imageModel,
        dynamicParams: mappedParams
    });
}

async function generateEndImage(startImageUrl, editPrompt, aspectRatio, resolution) {
    // Check if model supports edit
    const selectedModel = IMAGE_MODELS.find(m => m.id === state.imageModel);
    if (!selectedModel || !selectedModel.supportsEdit) {
        throw new Error(`Model ${state.imageModel} doesn't support image editing. Please select a model with edit support for Pair mode.`);
    }

    // Use custom edit endpoint if specified, otherwise append /edit
    const editEndpoint = selectedModel.editEndpoint || `${state.imageModel}/edit`;

    // Get dynamic parameters from UI
    const dynamicParams = uiGenerator.getValues();
    
    // Map parameters for the current provider
    const mappedParams = parameterMapper.mapParameters(
        state.imageModel,
        providerManager.activeProviderId,
        dynamicParams,
        { prompt: editPrompt, sourceUrl: startImageUrl }
    );

    return await providerManager.getActive().editImage({
        sourceUrl: startImageUrl,
        prompt: editPrompt,
        resolution: resolution,
        model: state.imageModel,
        editEndpoint: editEndpoint,
        dynamicParams: mappedParams
    });
}

async function generateSingleImage(prompt, aspectRatio, resolution) {
    // Get dynamic parameters from UI
    const dynamicParams = uiGenerator.getValues();
    
    // Map parameters for the current provider
    const mappedParams = parameterMapper.mapParameters(
        state.imageModel,
        providerManager.activeProviderId,
        dynamicParams,
        { prompt: prompt }
    );

    return await providerManager.getActive().generateImage({
        prompt: prompt,
        aspectRatio: aspectRatio,
        resolution: resolution,
        model: state.imageModel,
        dynamicParams: mappedParams
    });
}

async function generateReferenceVariation(referenceUrl, prompt, aspectRatio, resolution) {
    // Check if model supports edit
    const selectedModel = IMAGE_MODELS.find(m => m.id === state.imageModel);
    if (!selectedModel || !selectedModel.supportsEdit) {
        throw new Error(`Model ${state.imageModel} doesn't support image editing. Please select a model with edit support for Reference mode.`);
    }

    // Use custom edit endpoint if specified
    const editEndpoint = selectedModel.editEndpoint;

    // Get dynamic parameters from UI
    const dynamicParams = uiGenerator.getValues();
    
    // Map parameters for the current provider
    const mappedParams = parameterMapper.mapParameters(
        state.imageModel,
        providerManager.activeProviderId,
        dynamicParams,
        { prompt: prompt, sourceUrl: referenceUrl }
    );

    return await providerManager.getActive().editImage({
        sourceUrl: referenceUrl,
        prompt: prompt,
        resolution: resolution,
        model: state.imageModel,
        editEndpoint: editEndpoint,
        dynamicParams: mappedParams
    });
}

async function captionImage(imageUrl, model) {
    return await providerManager.getActive().captionImage({
        imageUrl: imageUrl,
        model: model
    });
}

// =============================================================================
// LLM Prompt Generation
// =============================================================================

async function generatePromptsWithLLM(theme, transformation, actionName, numPrompts, model) {
    const customSystemPrompt = getSystemPrompt();
    let prompts = [];

    if (state.mode === 'pair') {
        // Pair mode logic
        const actionHint = actionName
            ? `Use this action name: "${actionName}"`
            : 'Generate a short, descriptive action name (like "unzoom", "add_bg", "enhance")';

        const systemPrompt = `${customSystemPrompt}

The transformation to learn: "${transformation}"
${actionHint}`;

        const userPrompt = `Generate ${numPrompts} unique prompt pairs for the theme: "${theme}"

Return ONLY valid JSON array:
[
  {
    "base_prompt": "detailed start image description...",
    "edit_prompt": "transformation instruction...",
    "action_name": "short_action"
  }
]`;
        prompts = await providerManager.getActive().generatePrompts({
            systemPrompt, userPrompt, count: numPrompts, model
        });

    } else if (state.mode === 'single') {
        const userPrompt = `Generate ${numPrompts} unique image prompts for the theme/style: "${theme}"

Return ONLY valid JSON array:
[
  {
    "prompt": "detailed image description capturing the style, aesthetic, composition, lighting, colors..."
  }
]`;
        prompts = await providerManager.getActive().generatePrompts({
            systemPrompt: customSystemPrompt,
            userPrompt,
            count: numPrompts,
            model
        });

    } else if (state.mode === 'reference') {
        const userPrompt = `Generate ${numPrompts} unique variation prompts for: "${theme}"

These prompts will be used to create variations of a reference image (character/product/style).
Each prompt should describe a different scenario, pose, angle, background, or context while keeping the subject consistent.

Return ONLY valid JSON array:
[
  {
    "prompt": "detailed description of the variation, keeping subject consistent but varying context..."
  }
]`;
        prompts = await providerManager.getActive().generatePrompts({
            systemPrompt: customSystemPrompt,
            userPrompt,
            count: numPrompts,
            model
        });
    }

    return prompts;
}

// =============================================================================
// UI Functions
// =============================================================================

function updateStatus(connected, message) {
    document.getElementById('statusDot').className = 'status-dot ' + (connected ? 'connected' : 'error');
    document.getElementById('statusText').textContent = message;
}

function updatePairCount() {
    document.getElementById('pairCount').textContent = state.pairs.length;
}

function getImageCost() {
    const resolution = document.getElementById('resolution').value;
    return resolution === '4K' ? 0.30 : 0.15;
}

function updateCostEstimate() {
    const numPairs = parseInt(document.getElementById('numPairs').value) || 20;
    const useVision = document.getElementById('useVisionCaption').checked;
    
    // Get dynamic parameters and calculate cost multiplier
    const dynamicParams = uiGenerator.getValues();
    const mappedParams = parameterMapper.mapParameters(
        state.imageModel,
        providerManager.activeProviderId,
        dynamicParams,
        {}
    );
    const costMultiplier = parameterMapper.getCostMultiplier(mappedParams);

    const imagesPerItem = state.mode === 'pair' ? 2 : 1;
    const baseCost = 0.15; // Base cost per image
    const imageCost = baseCost * costMultiplier;
    const totalImageCost = numPairs * imagesPerItem * imageCost;
    const visionCost = useVision ? numPairs * (state.mode === 'pair' ? 2 : 1) * 0.002 : 0;
    const llmCost = 0.02;
    const total = totalImageCost + visionCost + llmCost;

    const resLabel = mappedParams.resolution === '4K' || mappedParams.quality === 'high' ? ' @4K' : '';
    document.getElementById('costEstimate').textContent = `~$${total.toFixed(2)}${resLabel}`;
}

function showLoading(show, message = 'Generating...') {
    state.isGenerating = show;
    const loader = document.getElementById('loadingIndicator');
    loader.classList.toggle('hidden', !show);
    loader.querySelector('span').textContent = message;
}

function showProgress(show) {
    document.getElementById('progressPanel').classList.toggle('hidden', !show);
}

function updateProgress(current, total, status) {
    const percent = total > 0 ? (current / total) * 100 : 0;
    document.getElementById('progressFill').style.width = `${percent}%`;
    document.getElementById('progressCurrent').textContent = current;
    document.getElementById('progressTotal').textContent = total;
    document.getElementById('progressStatus').textContent = status;
}

function addProgressLog(message, type = 'info') {
    const log = document.getElementById('progressLog');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = message;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

function clearProgressLog() {
    document.getElementById('progressLog').innerHTML = '';
}

function formatMetadataString(metadata) {
    if (!metadata) return '';
    return `\n\n--- [Generation Metadata] ---\nModel: ${metadata.model}\nResolution: ${metadata.resolution}\nAspect Ratio: ${metadata.aspectRatio}`;
    // Scheduler/Steps currently default, omitted for brevity until they are variable
}

function addResultCard(item) {
    const container = document.getElementById('results');
    const card = document.createElement('div');
    card.className = 'result-card';

    // Prepare metadata string
    const metaStr = formatMetadataString(item.metadata);

    if (state.mode === 'pair') {
        // Pair mode - show START and END images
        card.innerHTML = `
            <div class="result-header">
                <span class="result-id">#${item.id}</span>
                <button class="btn-toggle-prompts" onclick="togglePrompts('${item.id}')" title="Show/Hide All Prompts">
                    <span class="toggle-icon">▼</span> Prompts
                </button>
            </div>
            <div class="result-images">
                <div class="result-image">
                    <span class="label">START</span>
                    <img src="${item.startUrl}" alt="Start" loading="lazy" onclick="openImagePreview(this.src)" style="cursor: zoom-in">
                </div>
                <div class="result-image">
                    <span class="label">END</span>
                    <img src="${item.endUrl}" alt="End" loading="lazy" onclick="openImagePreview(this.src)" style="cursor: zoom-in">
                </div>
            </div>
            <div class="result-prompts collapsed" id="prompts-${item.id}">
                <div class="prompt-section" id="section-${item.id}-start">
                    <div class="prompt-header" onclick="toggleSection('section-${item.id}-start')">
                        <span class="prompt-label"><span class="prompt-toggle-icon">▼</span> 📝 START Prompt:</span>
                        <button class="btn-copy-prompt" onclick="event.stopPropagation(); copyPromptToClipboard('${item.id}', 'start')" title="Copy to clipboard">📋</button>
                    </div>
                    <div class="prompt-content">
                        <div class="prompt-text" id="prompt-${item.id}-start">${escapeHtml((item.startPrompt || '') + metaStr)}</div>
                    </div>
                </div>
                <div class="prompt-section" id="section-${item.id}-edit">
                    <div class="prompt-header" onclick="toggleSection('section-${item.id}-edit')">
                        <span class="prompt-label"><span class="prompt-toggle-icon">▼</span> 🔄 EDIT Prompt:</span>
                        <button class="btn-copy-prompt" onclick="event.stopPropagation(); copyPromptToClipboard('${item.id}', 'edit')" title="Copy to clipboard">📋</button>
                    </div>
                    <div class="prompt-content">
                        <div class="prompt-text" id="prompt-${item.id}-edit">${escapeHtml((item.endPrompt || '') + metaStr)}</div>
                    </div>
                </div>
                ${item.text ? `
                <div class="prompt-section" id="section-${item.id}-caption">
                    <div class="prompt-header" onclick="toggleSection('section-${item.id}-caption')">
                        <span class="prompt-label"><span class="prompt-toggle-icon">▼</span> 🏷️ Caption:</span>
                        <button class="btn-copy-prompt" onclick="event.stopPropagation(); copyPromptToClipboard('${item.id}', 'caption')" title="Copy to clipboard">📋</button>
                    </div>
                    <div class="prompt-content">
                        <div class="prompt-text" id="prompt-${item.id}-caption">${escapeHtml(item.text)}</div>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    } else {
        // Single/Reference mode - show single image
        card.innerHTML = `
            <div class="result-header">
                <span class="result-id">#${item.id}</span>
                <button class="btn-toggle-prompts" onclick="togglePrompts('${item.id}')" title="Show/Hide All Prompts">
                    <span class="toggle-icon">▼</span> Prompts
                </button>
            </div>
            <div class="result-images single">
                <div class="result-image">
                    <img src="${item.imageUrl}" alt="Result" loading="lazy" onclick="openImagePreview(this.src)" style="cursor: zoom-in">
                </div>
            </div>
            <div class="result-prompts collapsed" id="prompts-${item.id}">
                <div class="prompt-section" id="section-${item.id}-prompt">
                    <div class="prompt-header" onclick="toggleSection('section-${item.id}-prompt')">
                        <span class="prompt-label"><span class="prompt-toggle-icon">▼</span> 📝 Generation Prompt:</span>
                        <button class="btn-copy-prompt" onclick="event.stopPropagation(); copyPromptToClipboard('${item.id}', 'prompt')" title="Copy to clipboard">📋</button>
                    </div>
                    <div class="prompt-content">
                        <div class="prompt-text" id="prompt-${item.id}-prompt">${escapeHtml((item.prompt || '') + metaStr)}</div>
                    </div>
                </div>
                ${item.text && item.text !== item.prompt ? `
                <div class="prompt-section" id="section-${item.id}-caption">
                    <div class="prompt-header" onclick="toggleSection('section-${item.id}-caption')">
                        <span class="prompt-label"><span class="prompt-toggle-icon">▼</span> 🏷️ Caption:</span>
                        <button class="btn-copy-prompt" onclick="event.stopPropagation(); copyPromptToClipboard('${item.id}', 'caption')" title="Copy to clipboard">📋</button>
                    </div>
                    <div class="prompt-content">
                        <div class="prompt-text" id="prompt-${item.id}-caption">${escapeHtml(item.text)}</div>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }

    container.insertBefore(card, container.firstChild);
}

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Toggle individual prompt section
window.toggleSection = function (sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    // Toggle collapsed class
    section.classList.toggle('collapsed');
}

// Toggle prompts visibility (all)
function togglePrompts(itemId) {
    const promptsDiv = document.getElementById(`prompts-${itemId}`);
    const button = event.currentTarget;
    const icon = button.querySelector('.toggle-icon');

    const isCollapsed = promptsDiv.classList.contains('collapsed');

    if (isCollapsed) {
        promptsDiv.classList.remove('collapsed');
        icon.textContent = '▲';
    } else {
        promptsDiv.classList.add('collapsed');
        icon.textContent = '▼';
    }
}

// Copy prompt to clipboard
async function copyPromptToClipboard(itemId, promptType) {
    const elementId = `prompt-${itemId}-${promptType}`;
    const element = document.getElementById(elementId);

    if (!element) {
        console.error('Element not found:', elementId);
        return;
    }

    const text = element.textContent;

    try {
        // Try modern API first
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            throw new Error('Clipboard API unavailable');
        }

        showCopyFeedback(itemId, promptType);
    } catch (err) {
        // Fallback: Create hidden textarea
        console.log('Clipboard API failed, using fallback:', err);
        try {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            textarea.style.top = "0";
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();

            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);

            if (successful) {
                showCopyFeedback(itemId, promptType);
            } else {
                throw new Error('execCommand failed');
            }
        } catch (fallbackErr) {
            console.error('Copy failed:', fallbackErr);
            alert('Failed to copy. Please manually select and copy text.');
        }
    }
}

function showCopyFeedback(itemId, promptType) {
    const sectionId = `section-${itemId}-${promptType}`;
    const section = document.getElementById(sectionId);
    if (!section) return;

    const btn = section.querySelector('.btn-copy-prompt');
    if (btn) {
        const original = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => btn.textContent = original, 2000);
    }
}

function truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
}

// =============================================================================
// Main Generation Function
// =============================================================================

// Helper to capture metadata
function getGenMetadata() {
    return {
        model: state.imageModel,
        resolution: document.getElementById('resolution').value,
        aspectRatio: document.getElementById('aspectRatio').value,
        scheduler: "Default",
        steps: "Default"
    };
}

// Generate a single pair (used for parallel execution) - PAIR MODE
async function generateSinglePair(prompt, index, total, aspectRatio, resolution, useVision, llmModel, triggerWord) {
    addProgressLog(`🎨 [${index + 1}/${total}] Starting: ${truncate(prompt.base_prompt, 35)}...`, 'info');

    try {
        // Generate START image
        addProgressLog(`   [${index + 1}] Generating START image...`, 'info');
        const startUrl = await generateStartImage(prompt.base_prompt, aspectRatio, resolution);
        addProgressLog(`   [${index + 1}] START done, generating END...`, 'info');

        // Generate END image
        const endUrl = await generateEndImage(startUrl, prompt.edit_prompt, aspectRatio, resolution);
        addProgressLog(`   [${index + 1}] END done!`, 'info');

        // Optional: Caption with vision
        let finalText = prompt.action_name;
        if (useVision) {
            try {
                const caption = await captionImage(endUrl, llmModel);
                finalText = caption;
            } catch (e) {
                console.warn('Vision caption failed:', e);
            }
        }

        // Add trigger word if specified
        if (triggerWord) {
            finalText = `${triggerWord} ${finalText}`;
        }

        return {
            startUrl,
            endUrl,
            startPrompt: prompt.base_prompt,
            endPrompt: prompt.edit_prompt,
            actionName: prompt.action_name,
            text: finalText,
            metadata: getGenMetadata() // Capture settings
        };
    } catch (error) {
        console.error(`Pair ${index + 1} error:`, error);
        throw new Error(error.message || error.toString() || 'Generation failed');
    }
}

// Generate a single image - SINGLE MODE
async function generateSingleItem(prompt, index, total, aspectRatio, resolution, useVision, llmModel, triggerWord) {
    addProgressLog(`🎨 [${index + 1}/${total}] Generating: ${truncate(prompt.prompt, 40)}...`, 'info');

    try {
        const imageUrl = await generateSingleImage(prompt.prompt, aspectRatio, resolution);
        addProgressLog(`   [${index + 1}] Image done!`, 'info');

        // Caption with vision
        let finalText = prompt.prompt;
        if (useVision) {
            try {
                const caption = await captionImage(imageUrl, llmModel);
                finalText = caption;
            } catch (e) {
                console.warn('Vision caption failed:', e);
            }
        }

        // Add trigger word if specified
        if (triggerWord) {
            finalText = `${triggerWord} ${finalText}`;
        }

        return {
            imageUrl,
            prompt: prompt.prompt,
            text: finalText,
            metadata: getGenMetadata() // Capture settings
        };
    } catch (error) {
        console.error(`Image ${index + 1} error:`, error);
        throw new Error(error.message || error.toString() || 'Generation failed');
    }
}

// Generate a reference variation - REFERENCE MODE
async function generateReferenceItem(prompt, index, total, referenceUrl, aspectRatio, resolution, useVision, llmModel, triggerWord) {
    addProgressLog(`🎨 [${index + 1}/${total}] Variation: ${truncate(prompt.prompt, 40)}...`, 'info');

    try {
        const imageUrl = await generateReferenceVariation(referenceUrl, prompt.prompt, aspectRatio, resolution);
        addProgressLog(`   [${index + 1}] Variation done!`, 'info');

        // Caption with vision
        let finalText = prompt.prompt;
        if (useVision) {
            try {
                const caption = await captionImage(imageUrl, llmModel);
                finalText = caption;
            } catch (e) {
                console.warn('Vision caption failed:', e);
            }
        }

        // Add trigger word if specified
        if (triggerWord) {
            finalText = `${triggerWord} ${finalText}`;
        }

        return {
            imageUrl,
            prompt: prompt.prompt,
            text: finalText,
            metadata: getGenMetadata() // Capture settings
        };
    } catch (error) {
        console.error(`Variation ${index + 1} error:`, error);
        throw new Error(error.message || error.toString() || 'Generation failed');
    }
}

async function startGeneration() {
    const numPairsInput = document.getElementById('numPairs');
    const numPairs = parseInt(numPairsInput.value) || 20;

    // Strict validation - block if over 40
    if (numPairs > 40) {
        alert('⚠️ Maximum 40 pairs allowed!\n\nPlease enter a number between 1 and 40.\n\nIf you need more pairs, run multiple generations - they will accumulate in memory.');
        numPairsInput.value = 40;
        return;
    }

    const theme = document.getElementById('theme').value.trim();
    const transformation = document.getElementById('transformation').value.trim();
    const actionName = document.getElementById('actionName').value.trim();
    const triggerWord = document.getElementById('triggerWord').value.trim();
    let maxConcurrent = parseInt(document.getElementById('maxConcurrent')?.value) || 3;

    // Ensure parallel requests do not exceed image count
    if (maxConcurrent > numPairs) {
        console.log(`Capping parallel requests (${maxConcurrent}) to match image count (${numPairs})`);
        maxConcurrent = numPairs;
        // Optional: Update UI to reflect this
        const concurrentInput = document.getElementById('maxConcurrent');
        if (concurrentInput) concurrentInput.value = maxConcurrent;
    }
    const aspectRatio = document.getElementById('aspectRatio').value;
    const resolution = document.getElementById('resolution').value;
    const useVision = document.getElementById('useVisionCaption').checked;
    const llmModel = document.getElementById('llmModel').value;

    // Validate based on mode
    if (!theme) {
        alert('Please fill in the dataset theme');
        return;
    }

    if (state.mode === 'pair' && !transformation) {
        alert('Please fill in the transformation to learn');
        return;
    }

    if (state.mode === 'reference' && !state.referenceImageBase64) {
        alert('Please upload a reference image');
        return;
    }

    // Validate model supports edit for pair/reference modes
    const selectedModel = IMAGE_MODELS.find(m => m.id === state.imageModel);
    if ((state.mode === 'pair' || state.mode === 'reference') && selectedModel && !selectedModel.supportsEdit) {
        alert(`⚠️ ${selectedModel.name} doesn't support image editing.\n\nPair mode and Reference mode require edit support.\nPlease select a different model (e.g., Nano Banana Pro) or switch to Single Image mode.`);
        return;
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
        showApiKeyModal();
        return;
    }

    // Confirm
    const imagesPerItem = state.mode === 'pair' ? 2 : 1;
    const cost = (numPairs * imagesPerItem * getImageCost() + 0.02).toFixed(2);
    const modeLabel = state.mode === 'pair' ? 'pairs' : 'images';
    if (!confirm(`Generate ${numPairs} ${modeLabel}?\n\n⚡ ${maxConcurrent} parallel requests\n💰 Estimated cost: ~$${cost}\n\nImages stored in memory.\nUse "Download ZIP" to save.`)) {
        return;
    }

    showProgress(true);
    clearProgressLog();
    updateProgress(0, numPairs, 'Generating prompts with AI...');
    addProgressLog('🤖 Generating creative prompts...', 'info');

    state.isGenerating = true;
    let completed = 0;
    let failed = 0;

    try {
        // Upload reference image if in reference mode
        let referenceUrl = null;
        if (state.mode === 'reference') {
            addProgressLog('📤 Uploading reference image...', 'info');
            referenceUrl = await uploadReferenceImage();
            addProgressLog('✅ Reference uploaded', 'success');
        }

        // Generate prompts
        const prompts = await generatePromptsWithLLM(theme, transformation, actionName, numPairs, llmModel);
        addProgressLog(`✅ Generated ${prompts.length} unique prompts`, 'success');
        addProgressLog(`⚡ Starting parallel generation (${maxConcurrent} at a time)...`, 'info');

        // Process in batches of maxConcurrent
        for (let i = 0; i < prompts.length; i += maxConcurrent) {
            if (!state.isGenerating) break;

            const batch = prompts.slice(i, Math.min(i + maxConcurrent, prompts.length));

            // Run batch in parallel based on mode
            let results;
            if (state.mode === 'pair') {
                results = await Promise.allSettled(
                    batch.map((p, batchIndex) =>
                        generateSinglePair(p, i + batchIndex, prompts.length, aspectRatio, resolution, useVision, llmModel, triggerWord)
                    )
                );
            } else if (state.mode === 'single') {
                results = await Promise.allSettled(
                    batch.map((p, batchIndex) =>
                        generateSingleItem(p, i + batchIndex, prompts.length, aspectRatio, resolution, useVision, llmModel, triggerWord)
                    )
                );
            } else if (state.mode === 'reference') {
                results = await Promise.allSettled(
                    batch.map((p, batchIndex) =>
                        generateReferenceItem(p, i + batchIndex, prompts.length, referenceUrl, aspectRatio, resolution, useVision, llmModel, triggerWord)
                    )
                );
            }

            // Process results
            for (let j = 0; j < results.length; j++) {
                const result = results[j];
                if (result.status === 'fulfilled') {
                    state.pairCounter++;
                    const item = {
                        id: String(state.pairCounter).padStart(4, '0'),
                        mode: state.mode,
                        ...result.value
                    };
                    state.pairs.push(item);
                    addResultCard(item);
                    updatePairCount();
                    completed++;
                    addProgressLog(`✅ #${item.id} complete`, 'success');
                } else {
                    failed++;
                    addProgressLog(`❌ ${i + j + 1} failed: ${result.reason?.message || 'Unknown error'}`, 'error');
                }
                updateProgress(completed + failed, prompts.length, `${completed}/${prompts.length} done`);
            }
        }

        const failInfo = failed > 0 ? ` (${failed} failed)` : '';
        updateProgress(prompts.length, prompts.length, 'Complete!');
        addProgressLog(`🎉 Done! ${completed} ${modeLabel} generated${failInfo}`, 'success');
        addProgressLog(`📥 Click "Download ZIP" to save your dataset`, 'info');

    } catch (error) {
        addProgressLog(`❌ Error: ${error.message}`, 'error');
        alert('Error: ' + error.message);
    } finally {
        state.isGenerating = false;
    }
}

function stopGeneration() {
    state.isGenerating = false;
    addProgressLog('⏹️ Stopped by user', 'info');
}

// =============================================================================
// ZIP Download
// =============================================================================

async function downloadZIP() {
    if (state.pairs.length === 0) {
        alert('No images to download! Generate some first.');
        return;
    }

    showLoading(true, 'Creating ZIP...');

    try {
        // Dynamic import JSZip
        const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
        const zip = new JSZip();

        // Check if any items are from reference mode
        const hasReferenceItems = state.pairs.some(item => item.mode === 'reference');

        // If in reference mode, add the reference image first
        if (hasReferenceItems && state.referenceImageBase64) {
            try {
                const response = await fetch(state.referenceImageBase64);
                const referenceBlob = await response.blob();
                zip.file('reference.png', referenceBlob);
            } catch (error) {
                console.error('Failed to add reference image to ZIP:', error);
            }
        }

        // Download and add each item
        for (let i = 0; i < state.pairs.length; i++) {
            const item = state.pairs[i];

            if (item.mode === 'pair' || (item.startUrl && item.endUrl)) {
                // Pair mode - two images
                const startBlob = await fetch(item.startUrl).then(r => r.blob());
                const endBlob = await fetch(item.endUrl).then(r => r.blob());

                zip.file(`${item.id}_start.png`, startBlob);
                zip.file(`${item.id}_end.png`, endBlob);

                // Create caption text file (vision caption only, for LoRA training)
                let textContent = item.text || '';
                // Note: Metadata usually NOT added to caption file for training pair purity, 
                // but can be added if desired. For now, we only add to prompt files.
                zip.file(`${item.id}.txt`, textContent);

                // Create metadata string
                const metaStr = formatMetadataString(item.metadata);

                // Also create separate prompt files for reference
                zip.file(`${item.id}_start_prompt.txt`, (item.startPrompt || '') + metaStr);
                zip.file(`${item.id}_edit_prompt.txt`, (item.endPrompt || '') + metaStr);
            } else {
                // Single/Reference mode - one image
                const imageBlob = await fetch(item.imageUrl).then(r => r.blob());

                zip.file(`${item.id}.png`, imageBlob);

                // Create metadata string
                const metaStr = formatMetadataString(item.metadata);

                // Create caption text file
                let textContent = item.text || '';
                zip.file(`${item.id}.txt`, textContent);

                // Also create separate prompt file for reference with metadata
                zip.file(`${item.id}_prompt.txt`, (item.prompt || '') + metaStr);
            }
        }

        // Generate and download
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lorafactory_dataset_${Date.now()}.zip`;
        a.click();
        URL.revokeObjectURL(url);

    } catch (error) {
        alert('Error creating ZIP: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function clearResults() {
    if (state.pairs.length === 0) return;
    if (!confirm(`Clear all ${state.pairs.length} items from memory?`)) return;

    state.pairs = [];
    state.pairCounter = 0;
    document.getElementById('results').innerHTML = '';
    updatePairCount();
}

// =============================================================================
// Image Model Discovery (FAL API)
// =============================================================================

async function fetchModelsFromFAL(apiKey = null) {
    console.log('Fetching models from FAL.ai...');

    // Try to fetch pricing, but continue even if it fails
    let pricingData = {};

    try {
        // Use provided API key or try to get it
        const key = apiKey || await getApiKey();
        const headers = {
            'Content-Type': 'application/json'
        };

        // Add API key if available (required for pricing endpoint)
        // FAL.ai uses "Key" prefix, not "Bearer"
        if (key) {
            headers['Authorization'] = `Key ${key}`;
            console.log('[fetchModelsFromFAL] Using API key for pricing request');
        } else {
            console.warn('[fetchModelsFromFAL] No API key available, pricing may fail');
        }

        // Fetch pricing for our curated models
        // API uses endpoint_id (singular) with comma-separated values
        const pricingUrl = `https://api.fal.ai/v1/models/pricing?endpoint_id=${CURATED_MODEL_IDS.join(',')}`;
        console.log('Fetching pricing from:', pricingUrl);

        const pricingResponse = await fetch(pricingUrl, { headers });

        if (!pricingResponse.ok) {
            const errorText = await pricingResponse.text();
            console.warn(`Pricing API returned ${pricingResponse.status}, using fallback pricing`);
            console.warn('Error response:', errorText);
        } else {
            const responseData = await pricingResponse.json();
            console.log('Pricing API response:', responseData);
            
            // Response format: { "prices": [{ "endpoint_id": "...", "unit_price": 1, "unit": "...", "currency": "..." }], ... }
            if (responseData.prices && Array.isArray(responseData.prices)) {
                // Convert prices array to object keyed by endpoint_id
                responseData.prices.forEach(item => {
                    if (item.endpoint_id) {
                        pricingData[item.endpoint_id] = {
                            unit_price: item.unit_price,
                            unit: item.unit,
                            currency: item.currency
                        };
                    }
                });
            }
            
            console.log('Parsed pricing data:', pricingData);
        }
    } catch (error) {
        console.warn('Failed to fetch pricing, using fallback:', error);
    }

    // Build models list (with or without live pricing)
    try {

        // Build models list with live pricing
        const models = [];

        for (const modelId of CURATED_MODEL_IDS) {
            const config = MODEL_CONFIG[modelId] || {};
            const pricing = pricingData[modelId];
            
            // Log what we got for this model
            if (pricing) {
                console.log(`[Model] ${modelId}:`, { pricing, config });
            } else {
                console.log(`[Model] ${modelId}: No pricing data, using fallback`);
            }

            // Extract version - search entire modelId, not just last part
            const versionMatch = modelId.match(/v(\d+(?:\.\d+)?)/i) ||
                modelId.match(/(\d+)-flex/) || // flux-2-flex
                modelId.match(/flux\/(\d+)/); // flux/2
            let version = versionMatch ? versionMatch[1] : '1.0';

            // Override with known versions
            const versionMap = {
                'fal-ai/nano-banana-pro': '1.0',
                'fal-ai/flux-2-flex': '2.0',
                'fal-ai/bytedance/seedream/v4.5/text-to-image': '4.5',
                'fal-ai/flux/dev': '1.0',
                'fal-ai/flux/schnell': '1.0',
                'fal-ai/aura-flow': '0.3',
                'fal-ai/recraft/v3/text-to-image': '3.0'
            };

            if (versionMap[modelId]) {
                version = versionMap[modelId];
            }

            // Override with known names
            const nameMap = {
                'fal-ai/nano-banana-pro': 'Nano Banana Pro',
                'fal-ai/flux-2-flex': 'Flux 2 Flex',
                'fal-ai/bytedance/seedream/v4.5/text-to-image': 'Seedream',
                'fal-ai/flux/dev': 'Flux Dev',
                'fal-ai/flux/schnell': 'Flux Schnell',
                'fal-ai/aura-flow': 'Aura Flow',
                'fal-ai/recraft/v3/text-to-image': 'Recraft'
            };

            const name = nameMap[modelId] || modelId.split('/').pop();

            // Fallback pricing (estimated as of Dec 2025)
            const fallbackPricing = {
                'fal-ai/nano-banana-pro': '$0.15/image',
                'fal-ai/flux-2-flex': '$0.06/megapixel',
                'fal-ai/bytedance/seedream/v4.5/text-to-image': '$0.04/image',
                'fal-ai/flux/dev': '$0.025/megapixel',
                'fal-ai/flux/schnell': '$0.003/megapixel',
                'fal-ai/aura-flow': 'Free (beta)',
                'fal-ai/recraft/v3/text-to-image': '$0.04/image'
            };

            // Format pricing
            let pricingText = fallbackPricing[modelId] || 'Pricing unavailable';
            let isApiPricing = false;
            
            if (pricing) {
                // Handle different pricing response formats
                let price, unit;
                
                if (pricing.unit_price !== undefined) {
                    // Format: { unit_price: 0.15, unit: "image" }
                    price = pricing.unit_price;
                    unit = pricing.unit || 'image';
                } else if (pricing.price !== undefined) {
                    // Format: { price: 0.15, unit: "image" }
                    price = pricing.price;
                    unit = pricing.unit || 'image';
                } else if (typeof pricing === 'number') {
                    // Format: just a number
                    price = pricing;
                    unit = 'image';
                } else if (pricing.cost !== undefined) {
                    // Format: { cost: 0.15, ... }
                    price = pricing.cost;
                    unit = pricing.unit || 'image';
                }
                
                if (price !== undefined) {
                    isApiPricing = true;
                    if (price === 0) {
                        pricingText = 'Free';
                    } else {
                        // Format with appropriate decimal places
                        const decimals = price < 0.01 ? 4 : (price < 1 ? 3 : 2);
                        pricingText = `$${price.toFixed(decimals)}/${unit}`;
                    }
                }
            }
            
            // Log pricing source
            if (isApiPricing) {
                console.log(`[Model] ${modelId}: Using API pricing: ${pricingText}`);
            } else {
                console.log(`[Model] ${modelId}: Using fallback pricing: ${pricingText}`);
            }

            models.push({
                id: modelId,
                name: name,
                version: version,
                pricing: pricingText,
                pricingSource: isApiPricing ? 'api' : 'fallback',
                supportsEdit: config.supportsEdit || false,
                editEndpoint: config.editEndpoint,
                description: config.description || `${name} model`
            });
        }

        if (models.length > 0) {
            IMAGE_MODELS = models;
            console.log('Models loaded successfully:', models.length);
        } else {
            throw new Error('No models were built');
        }

    } catch (error) {
        console.error('Failed to build models list:', error);
        console.log('Using comprehensive fallback models');

        // Build fallback from MODEL_CONFIG
        IMAGE_MODELS = CURATED_MODEL_IDS.map(modelId => {
            const config = MODEL_CONFIG[modelId] || {};

            const versionMap = {
                'fal-ai/nano-banana-pro': '1.0',
                'fal-ai/flux-2-flex': '2.0',
                'fal-ai/bytedance/seedream/v4.5/text-to-image': '4.5',
                'fal-ai/flux/dev': '1.0',
                'fal-ai/flux/schnell': '1.0',
                'fal-ai/aura-flow': '0.3',
                'fal-ai/recraft/v3/text-to-image': '3.0'
            };

            const nameMap = {
                'fal-ai/nano-banana-pro': 'Nano Banana Pro',
                'fal-ai/flux-2-flex': 'Flux 2 Flex',
                'fal-ai/bytedance/seedream/v4.5/text-to-image': 'Seedream',
                'fal-ai/flux/dev': 'Flux Dev',
                'fal-ai/flux/schnell': 'Flux Schnell',
                'fal-ai/aura-flow': 'Aura Flow',
                'fal-ai/recraft/v3/text-to-image': 'Recraft'
            };

            const fallbackPricing = {
                'fal-ai/nano-banana-pro': '$0.15/image',
                'fal-ai/flux-2-flex': '$0.06/megapixel',
                'fal-ai/bytedance/seedream/v4.5/text-to-image': '$0.04/image',
                'fal-ai/flux/dev': '$0.025/megapixel',
                'fal-ai/flux/schnell': '$0.003/megapixel',
                'fal-ai/aura-flow': 'Free (beta)',
                'fal-ai/recraft/v3/text-to-image': '$0.04/image'
            };

            return {
                id: modelId,
                name: nameMap[modelId] || modelId.split('/').pop(),
                version: versionMap[modelId] || '1.0',
                pricing: fallbackPricing[modelId] || 'Contact FAL',
                supportsEdit: config.supportsEdit || false,
                editEndpoint: config.editEndpoint,
                description: config.description || `${nameMap[modelId]} model`
            };
        });

        console.log('Fallback models loaded:', IMAGE_MODELS.length);
    }
}

// =============================================================================
// Image Model Selection
// =============================================================================

function populateImageModels() {
    // Get unified panel select (this is the only select now)
    const select = document.querySelector('#modelParametersPanel #imageModel');
    const descElement = document.querySelector('#modelParametersPanel #imageModelDesc') || 
                        document.querySelector('#modelParametersPanel .model-info small');
    
    if (!select) {
        console.error('Model select element not found in unified panel');
        return;
    }

    // Clear existing options
    select.innerHTML = '';

    // Verify IMAGE_MODELS is populated
    if (!IMAGE_MODELS || IMAGE_MODELS.length === 0) {
        console.error('IMAGE_MODELS is empty! Cannot populate dropdown.');
        descElement.textContent = 'Error: No models available. Check console for details.';
        return;
    }
    
    console.log(`[populateImageModels] Populating dropdown with ${IMAGE_MODELS.length} models:`, IMAGE_MODELS);

    // Add models to dropdown
    let apiPricingCount = 0;
    let fallbackPricingCount = 0;
    
    IMAGE_MODELS.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        
        // Track pricing source
        if (model.pricingSource === 'api') {
            apiPricingCount++;
        } else {
            fallbackPricingCount++;
        }
        
        option.textContent = `${model.name} v${model.version} - ${model.pricing}`;
        if (!model.supportsEdit) {
            option.textContent += ' (no edit)';
        }
        select.appendChild(option);
    });
    
    // Log pricing summary
    console.log(`[populateImageModels] Pricing summary: ${apiPricingCount} from API, ${fallbackPricingCount} fallback`);

    // Set default value
    select.value = state.imageModel;

    // Handle model change
    const handleModelChange = async (e) => {
        const newModelId = e.target.value;
        state.imageModel = newModelId;
        try {
            localStorage.setItem('selected_image_model', newModelId);
        } catch (e) {}
        
        const selectedModel = IMAGE_MODELS.find(m => m.id === newModelId);
        if (selectedModel) {
            // Update description
            if (descElement) {
                descElement.textContent = `v${selectedModel.version} - ${selectedModel.description}`;
            }

            // Warn if model doesn't support edit and user is in pair/reference mode
            if (!selectedModel.supportsEdit && (state.mode === 'pair' || state.mode === 'reference')) {
                alert(`⚠️ ${selectedModel.name} v${selectedModel.version} doesn't support image editing.\n\nPair mode and Reference mode require edit support. Please select a different model or switch to Single Image mode.`);
            }

            // Render dynamic parameters UI
            try {
                await uiGenerator.renderUI(newModelId, 'modelParametersPanel');
            } catch (error) {
                console.error('Failed to render dynamic parameters:', error);
                // Fallback: show legacy static controls
                const legacyControls = document.getElementById('legacyStaticControls');
                if (legacyControls) legacyControls.style.display = 'block';
            }
        }
        updateCostEstimate();
    };

    // Add event listener
    select.addEventListener('change', handleModelChange);

    // Set initial description
    const initialModel = IMAGE_MODELS.find(m => m.id === state.imageModel);
    if (initialModel && descElement) {
        descElement.textContent = `v${initialModel.version} - ${initialModel.description}`;
    }
    
    // Ensure panel is visible (remove hidden class if present)
    const panel = document.getElementById('modelParametersPanel');
    if (panel) {
        panel.classList.remove('hidden');
        console.log('[populateImageModels] Panel ensured visible');
    } else {
        console.error('[populateImageModels] Panel element not found!');
    }
    
    // Render initial dynamic parameters UI
    if (initialModel) {
        setTimeout(async () => {
            try {
                await uiGenerator.renderUI(state.imageModel, 'modelParametersPanel');
            } catch (error) {
                console.error('Failed to render initial parameters:', error);
                // Fallback: show legacy static controls
                const legacyControls = document.getElementById('legacyStaticControls');
                if (legacyControls) legacyControls.style.display = 'block';
            }
        }, 100);
    }
}

// =============================================================================
// Image Preview
// =============================================================================

function openImagePreview(url) {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    modal.classList.remove('hidden');
    img.src = url;
    document.body.style.overflow = 'hidden'; // Prevent scrolling
}

function closeImagePreview() {
    const modal = document.getElementById('imagePreviewModal');
    modal.classList.add('hidden');
    document.getElementById('previewImage').src = '';
    document.body.style.overflow = ''; // Restore scrolling
}

// Global Event Listeners for Preview
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('imagePreviewModal');
    if (!modal.classList.contains('hidden')) {
        if (e.key === 'Escape' || e.key === ' ') {
            e.preventDefault(); // Prevent scrolling on space
            closeImagePreview();
        }
    }
});

// Expose for onclick
window.openImagePreview = openImagePreview;
window.closeImagePreview = closeImagePreview;

// =============================================================================
// Initialization
// =============================================================================

async function init() {
    // Register custom providers first so persisted selection can be restored
    loadCustomProviders();

    // Restore previously selected provider if available
    try {
        const savedProvider = localStorage.getItem('active_provider_id');
        if (savedProvider) {
            providerManager.setActive(savedProvider);
        }
    } catch (e) {}

    // Show security banner if not dismissed
    const bannerDismissed = localStorage.getItem('security_banner_dismissed');
    if (!bannerDismissed) {
        const banner = document.getElementById('securityBanner');
        if (banner) banner.style.display = 'flex';
    }

    // Check for API key FIRST, then fetch models with pricing
    let apiKey = await getApiKey();
    
    // Fetch models from FAL API (with live pricing) - pass API key if available
    await fetchModelsFromFAL(apiKey);

    // Populate image models dropdown (wait a tick to ensure IMAGE_MODELS is populated)
    await new Promise(resolve => setTimeout(resolve, 0));
    populateImageModels();

    // Configure providers with API key
    if (apiKey) {
        // Initialize active provider
        try {
            await providerManager.getActive().setApiKey(apiKey);
            // Also set API key for schema manager
            schemaManager.setApiKey(apiKey);
        } catch (e) {
            console.error('Failed to configure provider:', e);
        }

        const settings = getSecuritySettings();
        const encrypted = settings.useEncryption ? ' (encrypted)' : '';
        updateStatus(true, `API Key Set${encrypted}`);
        setupAutoClear();
        
        // Retry pricing fetch with API key if we didn't have it before
        if (IMAGE_MODELS.every(m => m.pricingSource === 'fallback')) {
            console.log('[init] Retrying pricing fetch with API key...');
            await fetchModelsFromFAL(apiKey);
            // Re-populate dropdown with updated pricing
            populateImageModels();
        }
    } else {
        updateStatus(false, 'Click 🔑 to add API key');
        setTimeout(() => showApiKeyModal(), 500);
    }

    // Setup cost estimate
    document.getElementById('numPairs').addEventListener('input', updateCostEstimate);
    document.getElementById('useVisionCaption').addEventListener('change', updateCostEstimate);
    document.getElementById('resolution').addEventListener('change', updateCostEstimate);
    updateCostEstimate();
    
    // Initialize saved prompts list
    updateSavedPromptsList();

    // Initialize mode
    setMode('pair');

    updatePairCount();

    // Setup drag and drop for reference image
    const uploadZone = document.getElementById('uploadZone');
    if (uploadZone) {
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                document.getElementById('referenceInput').files = e.dataTransfer.files;
                handleReferenceUpload({ target: { files: [file] } });
            }
        });
    }

    // Reset auto-clear timer on user activity
    document.addEventListener('click', resetAutoClearTimer);
    document.addEventListener('keypress', resetAutoClearTimer);
}

// Export to global scope for onclick handlers
window.showApiKeyModal = showApiKeyModal;
window.hideApiKeyModal = hideApiKeyModal;
window.toggleKeyVisibility = toggleKeyVisibility;
window.startGeneration = startGeneration;
window.stopGeneration = stopGeneration;
window.downloadZIP = downloadZIP;
window.clearResults = clearResults; // Expose for UI
window.setMode = setMode;
window.showApiKeyModal = showApiKeyModal;
window.hideApiKeyModal = hideApiKeyModal;
window.saveApiKey = saveApiKey;
window.clearApiKey = clearApiKey;
window.toggleKeyVisibility = toggleKeyVisibility;
window.showSecuritySettings = showSecuritySettings;
window.hideSecuritySettings = hideSecuritySettings;
window.saveSecuritySettings = saveSecuritySettings;
window.dismissSecurityBanner = dismissSecurityBanner;
window.toggleSystemPrompt = toggleSystemPrompt;
window.resetSystemPrompt = resetSystemPrompt;
window.saveSystemPrompt = saveSystemPrompt;
window.loadSavedPrompt = loadSavedPrompt;
window.deleteSavedPrompt = deleteSavedPrompt;
window.exportSystemPrompts = exportSystemPrompts;
window.importSystemPrompts = importSystemPrompts;
window.handleReferenceUpload = handleReferenceUpload;
window.clearReference = clearReference;
window.copyPromptToClipboard = copyPromptToClipboard;
window.togglePrompts = togglePrompts;
window.addResultCard = addResultCard;

// Custom Provider Exports
window.addCustomProvider = addCustomProvider;
window.deleteCustomProvider = deleteCustomProvider;

document.addEventListener('DOMContentLoaded', init);
