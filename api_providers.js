import { fal } from 'https://esm.sh/@fal-ai/client@1.2.1';

// =============================================================================
// Base Provider Class
// =============================================================================

export class ApiProvider {
    constructor(config) {
        if (new.target === ApiProvider) {
            throw new TypeError("Cannot construct ApiProvider instances directly");
        }
        this.id = config.id;
        this.name = config.name;
        this.capabilities = config.capabilities || [];
        // Capabilities: 'text-to-image', 'image-to-image', 'llm', 'vision'
    }

    async setApiKey(key) { throw new Error("Not implemented"); }

    async uploadImage(blob) { throw new Error("Not implemented"); }

    // Core Generation Methods
    async generateImage(params) { throw new Error("Not implemented"); }
    async editImage(params) { throw new Error("Not implemented"); }
    async generatePrompts(params) { throw new Error("Not implemented"); }
    async captionImage(params) { throw new Error("Not implemented"); }
}

// =============================================================================
// FAL.ai Provider
// =============================================================================

export class FalProvider extends ApiProvider {
    constructor() {
        super({
            id: 'fal',
            name: 'FAL.ai',
            capabilities: ['text-to-image', 'image-to-image', 'llm', 'vision']
        });
    }

    async setApiKey(key) {
        if (key) {
            fal.config({ credentials: key });
        }
    }

    async uploadImage(blob) {
        const url = await fal.storage.upload(blob);
        return url;
    }

    // Generic Internal Request
    async _request(endpoint, input) {
        try {
            // console.log(`[FAL] Request to ${endpoint}:`, input);
            const result = await fal.subscribe(endpoint, { input });
            // console.log(`[FAL] Response from ${endpoint}:`, result);
            return result.data || result;
        } catch (error) {
            console.error(`[FAL] Error ${endpoint}:`, error);
            throw new Error(error.message || error.body?.detail || 'FAL API call failed');
        }
    }

    async generateImage({ prompt, aspectRatio, resolution, model, dynamicParams = {} }) {
        // Support both legacy and dynamic parameters
        const params = {
            prompt: prompt,
            num_images: 1,
            enable_safety_checker: false,
            // Spread dynamic params (will override defaults if provided)
            ...dynamicParams
        };

        // Add legacy params if not in dynamicParams
        if (!dynamicParams.aspect_ratio && aspectRatio) {
            params.aspect_ratio = aspectRatio;
        }
        if (!dynamicParams.resolution && resolution) {
            params.resolution = resolution;
        }

        const result = await this._request(model, params);
        return result.images[0].url;
    }

    async editImage({ sourceUrl, prompt, resolution, model, editEndpoint, dynamicParams = {} }) {
        // Use custom edit endpoint if provided (some generic models might fallback)
        const endpoint = editEndpoint || `${model}/edit`;

        // Support both legacy and dynamic parameters
        const params = {
            image_urls: [sourceUrl],
            prompt: prompt,
            aspect_ratio: 'auto',
            enable_safety_checker: false,
            // Spread dynamic params (will override defaults if provided)
            ...dynamicParams
        };

        // Add legacy resolution if not in dynamicParams
        if (!dynamicParams.resolution && resolution) {
            params.resolution = resolution;
        }

        const result = await this._request(endpoint, params);
        return result.images[0].url;
    }

    async generatePrompts({ systemPrompt, userPrompt, count, model }) {
        // Using fal-ai/any-llm for generic LLM calls
        const result = await this._request('fal-ai/any-llm', {
            model: model,
            system_prompt: systemPrompt,
            prompt: userPrompt,
            max_tokens: 16000
        });

        // Parse JSON output
        const text = result.output;
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error('Failed to parse LLM response');
        }
        return JSON.parse(jsonMatch[0]);
    }

    async captionImage({ imageUrl, model }) {
        // Using openrouter/vision proxy via FAL
        const result = await this._request('openrouter/router/vision', {
            model: model,
            prompt: "Caption this image for a text-to-image model. Describe everything visible in detail: subject, appearance, clothing, pose, expression, background, lighting, colors, style. Be specific and comprehensive.",
            system_prompt: "Only answer the question, do not provide any additional information. Don't use markdown.",
            image_urls: [imageUrl],
            temperature: 1.0
        });
        return result.output;
    }
}

// =============================================================================
// Generic Provider (Configurable via JSON)
// =============================================================================

export class GenericProvider extends ApiProvider {
    constructor(config) {
        super({
            id: config.id,
            name: config.name,
            capabilities: config.capabilities || ['text-to-image'] // Default capability
        });
        this.config = config;
        this.apiKey = null;
    }

    async setApiKey(key) {
        this.apiKey = key;
    }

    // JSON Path helper to extract value from response
    _getValueByPath(obj, path) {
        return path.split('.').reduce((o, i) => (o ? o[i] : null), obj);
    }

    // Template helper to replace {{key}} with values
    _fillTemplate(templateStr, data) {
        return templateStr.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            return data[key] || '';
        });
    }

    async _request(action, params) {
        const actionConfig = this.config.endpoints?.[action];
        if (!actionConfig) {
            throw new Error(`Provider ${this.name} does not support ${action}`);
        }

        const url = actionConfig.url;
        const method = actionConfig.method || 'POST';

        // Prepare headers
        const headers = {
            'Content-Type': 'application/json',
            ...actionConfig.headers
        };

        // Add Auth Header if configured
        if (this.config.auth && this.apiKey) {
            const authHeader = this.config.auth.header || 'Authorization';
            const authPrefix = this.config.auth.prefix || 'Bearer ';
            headers[authHeader] = `${authPrefix}${this.apiKey}`;
        }

        // Prepare body
        let body = null;
        if (actionConfig.body) {
            // If body is a string template, parse it
            const bodyStr = typeof actionConfig.body === 'string'
                ? actionConfig.body
                : JSON.stringify(actionConfig.body);

            const filledBodyStr = this._fillTemplate(bodyStr, params);
            body = filledBodyStr; // Send as string (it's JSON)
        }

        // Make Request
        const response = await fetch(url, {
            method,
            headers,
            body
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`${this.name} Error (${response.status}): ${text}`);
        }

        const data = await response.json();

        // Extract result
        if (actionConfig.responsePath) {
            const result = this._getValueByPath(data, actionConfig.responsePath);
            if (!result) throw new Error(`Could not find result at path '${actionConfig.responsePath}' in response`);
            return result;
        }

        return data; // Return full data if no path specified
    }

    async generateImage(params) {
        // params: { prompt, aspectRatio, resolution, model, dynamicParams }
        // Generic providers might rely on a template for "prompt"
        const allParams = { ...params, ...(params.dynamicParams || {}) };
        return await this._request('generateImage', allParams);
    }

    // TODO: Implement edit, crypto, upload if configured
    async editImage(params) {
        // If config has 'editImage' endpoint, use it
        if (this.config.endpoints?.editImage) {
            const allParams = { ...params, ...(params.dynamicParams || {}) };
            return await this._request('editImage', allParams);
        }
        throw new Error(`${this.name} does not support image editing`);
    }

    async generatePrompts(params) {
        // If config has 'generatePrompts' endpoint (LLM wrapper)
        if (this.config.endpoints?.generatePrompts) {
            // Expects JSON array in response
            return await this._request('generatePrompts', params);
        }
        throw new Error(`${this.name} does not support prompt generation`);
    }

    async captionImage(params) {
        if (this.config.endpoints?.captionImage) {
            return await this._request('captionImage', params);
        }
        throw new Error(`${this.name} does not support image captioning`);
    }
}

// =============================================================================
// Kie.ai Provider
// =============================================================================

export class KieProvider extends ApiProvider {
    constructor() {
        super({
            id: 'kie',
            name: 'Kie.ai',
            capabilities: ['text-to-image', 'image-to-image']
        });
        this.apiKey = null;
        this.baseUrl = 'https://api.kie.ai';
    }

    async setApiKey(key) {
        this.apiKey = key;
    }

    async uploadImage(blob) {
        // Kie.ai uses a different domain for file uploads
        const formData = new FormData();
        formData.append('file', blob, 'reference.png');
        formData.append('uploadPath', 'lorafactory');
        formData.append('fileName', `ref_${Date.now()}.png`);

        const response = await fetch('https://kieai.redpandaai.co/api/file-stream-upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Kie.ai upload failed (${response.status}): ${error}`);
        }

        const data = await response.json();
        // Response should contain the file URL
        return data.url || data.fileUrl || data.downloadUrl || data.data?.url;
    }

    async _createTask(model, input) {
        const response = await fetch(`${this.baseUrl}/api/v1/jobs/createTask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: model,
                input: input
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Kie.ai createTask failed (${response.status}): ${error}`);
        }

        const data = await response.json();
        return data.taskId || data.data?.taskId;
    }

    async _pollTaskResult(taskId, maxAttempts = 60, intervalMs = 2000) {
        for (let i = 0; i < maxAttempts; i++) {
            const response = await fetch(`${this.baseUrl}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error(`Kie.ai recordInfo failed: ${response.status}`);
            }

            const result = await response.json();
            const status = result.status || result.data?.status;

            if (status === 'SUCCESS' || status === 'COMPLETED') {
                return result.data || result;
            } else if (status === 'FAILED' || status === 'ERROR') {
                throw new Error(`Task failed: ${result.error || result.message || 'Unknown error'}`);
            }

            // Still processing, wait and retry
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }

        throw new Error('Task timeout: exceeded maximum polling attempts');
    }

    async generateImage({ prompt, aspectRatio, resolution, model, dynamicParams = {} }) {
        // Support both legacy and dynamic parameters
        const params = {
            prompt: prompt,
            ...dynamicParams
        };

        // Add legacy params if not in dynamicParams
        if (!dynamicParams.aspect_ratio && aspectRatio) {
            params.aspect_ratio = aspectRatio;
        }
        if (!dynamicParams.quality && resolution) {
            params.quality = resolution === '4K' ? 'high' : 'basic';
        }

        const taskId = await this._createTask('seedream/4.5-text-to-image', params);

        const result = await this._pollTaskResult(taskId);

        // Extract image URL from result
        if (result.outputMediaUrls && result.outputMediaUrls.length > 0) {
            return result.outputMediaUrls[0].mediaUrl;
        } else if (result.output && result.output.length > 0) {
            return result.output[0];
        }

        throw new Error('No image URL in response');
    }

    async editImage({ sourceUrl, prompt, resolution, model, editEndpoint, dynamicParams = {} }) {
        // Support both legacy and dynamic parameters
        const params = {
            prompt: prompt,
            image_urls: [sourceUrl],
            aspect_ratio: 'auto',
            ...dynamicParams
        };

        // Add legacy quality if not in dynamicParams
        if (!dynamicParams.quality && resolution) {
            params.quality = resolution === '4K' ? 'high' : 'basic';
        }

        const taskId = await this._createTask('seedream/4.5-edit', params);

        const result = await this._pollTaskResult(taskId);

        // Extract image URL from result
        if (result.outputMediaUrls && result.outputMediaUrls.length > 0) {
            return result.outputMediaUrls[0].mediaUrl;
        } else if (result.output && result.output.length > 0) {
            return result.output[0];
        }

        throw new Error('No image URL in response');
    }

    // Kie.ai doesn't support LLM/vision, so throw errors
    async generatePrompts(params) {
        throw new Error('Kie.ai does not support prompt generation. Use FAL.ai for LLM features.');
    }

    async captionImage(params) {
        throw new Error('Kie.ai does not support image captioning. Use FAL.ai for vision features.');
    }
}

// =============================================================================
// Wisdom Gate Provider (OpenAI-compatible API)
// =============================================================================

export class WisdomGateProvider extends ApiProvider {
    constructor() {
        super({
            id: 'wisdomgate',
            name: 'Wisdom Gate',
            capabilities: ['text-to-image', 'image-to-image', 'llm', 'vision']
        });
        this.apiKey = null;
        this.baseUrl = 'https://wisdom-gate.juheapi.com/v1';
    }

    async setApiKey(key) {
        this.apiKey = key;
    }

    async uploadImage(blob) {
        // Wisdom Gate supports base64 data URLs (OpenAI-compatible)
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Return base64 data URL (e.g., "data:image/png;base64,iVBORw0KG...")
                resolve(reader.result);
            };
            reader.onerror = () => {
                reject(new Error('Failed to convert image to base64'));
            };
            reader.readAsDataURL(blob);
        });
    }

    async generateImage({ prompt, aspectRatio, resolution, model, dynamicParams = {} }) {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model || 'gemini-3-pro-image-preview',
                messages: [{ role: 'user', content: prompt }],
                image_config: {
                    aspect_ratio: dynamicParams.aspect_ratio || aspectRatio || '16:9',
                    image_size: dynamicParams.image_size || resolution || '2K'
                },
                enable_safety_checker: dynamicParams.enable_safety_checker !== undefined
                    ? dynamicParams.enable_safety_checker
                    : false,
                ...dynamicParams
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Wisdom Gate error (${response.status}): ${error}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        // Extract image URL from markdown format: ![image](https://...)
        const imageUrlMatch = content.match(/https:\/\/[^)]+\.(png|jpg|jpeg)/);
        if (!imageUrlMatch) {
            throw new Error(`No image URL found in response: ${content}`);
        }

        return imageUrlMatch[0];
    }

    async editImage({ sourceUrl, prompt, resolution, model, editEndpoint, dynamicParams = {} }) {
        // Wisdom Gate uses vision capabilities for image editing
        // Send image URL in messages with multimodal content
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model || 'gemini-3-pro-image-preview',
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: prompt
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: sourceUrl
                            }
                        }
                    ]
                }],
                image_config: {
                    aspect_ratio: 'auto',
                    image_size: dynamicParams.image_size || resolution || '2K'
                },
                enable_safety_checker: dynamicParams.enable_safety_checker !== undefined
                    ? dynamicParams.enable_safety_checker
                    : false,
                ...dynamicParams
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Wisdom Gate error (${response.status}): ${error}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        // Extract image URL from markdown format
        const imageUrlMatch = content.match(/https:\/\/[^)]+\.(png|jpg|jpeg)/);
        if (!imageUrlMatch) {
            throw new Error(`No image URL found in response: ${content}`);
        }

        return imageUrlMatch[0];
    }

    async generatePrompts({ systemPrompt, userPrompt, count, model }) {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model || 'wisdom-ai-gpt5',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 1.0,
                max_tokens: 16000
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Wisdom Gate error (${response.status}): ${error}`);
        }

        const data = await response.json();
        const text = data.choices[0].message.content;

        // Parse JSON output
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error('Failed to parse LLM response');
        }
        return JSON.parse(jsonMatch[0]);
    }

    async captionImage({ imageUrl, model }) {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model || 'gemini-3-pro-image-preview',
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: "Caption this image for a text-to-image model. Describe everything visible in detail: subject, appearance, clothing, pose, expression, background, lighting, colors, style. Be specific and comprehensive."
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageUrl
                            }
                        }
                    ]
                }],
                temperature: 1.0
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Wisdom Gate error (${response.status}): ${error}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }
}

// =============================================================================
// Provider Manager (Singleton)
// =============================================================================

class ProviderManager {
    constructor() {
        this.providers = {};
        this.activeProviderId = 'fal'; // Default

        // Register default providers
        this.register(new FalProvider());
        this.register(new KieProvider());
        this.register(new WisdomGateProvider());
    }

    register(provider) {
        this.providers[provider.id] = provider;
    }

    unregister(id) {
        if (id !== 'fal') { // Prevent removing default
            delete this.providers[id];
        }
    }

    get(id) {
        return this.providers[id];
    }

    getAll() {
        return Object.values(this.providers);
    }

    getActive() {
        return this.providers[this.activeProviderId];
    }

    setActive(id) {
        if (!this.providers[id]) {
            throw new Error(`Provider ${id} not found`);
        }
        this.activeProviderId = id;
    }
}

export const providerManager = new ProviderManager();
