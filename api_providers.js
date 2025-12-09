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

    async generateImage({ prompt, aspectRatio, resolution, model }) {
        // Handle "auto" aspect ratio or specific logic if needed
        const result = await this._request(model, {
            prompt: prompt,
            aspect_ratio: aspectRatio,
            resolution: resolution,
            num_images: 1
        });
        return result.images[0].url;
    }

    async editImage({ sourceUrl, prompt, resolution, model, editEndpoint }) {
        // Use custom edit endpoint if provided (some generic models might fallback)
        const endpoint = editEndpoint || `${model}/edit`;

        const result = await this._request(endpoint, {
            image_urls: [sourceUrl],
            prompt: prompt,
            aspect_ratio: 'auto',
            resolution: resolution
        });
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
// Provider Manager (Singleton)
// =============================================================================

class ProviderManager {
    constructor() {
        this.providers = {};
        this.activeProviderId = 'fal'; // Default

        // Register default provider
        this.register(new FalProvider());
    }

    register(provider) {
        this.providers[provider.id] = provider;
    }

    get(id) {
        return this.providers[id];
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
