/**
 * SchemaManager - Fetches and caches OpenAPI schemas from FAL.ai API
 * Handles parameter definitions, constraints, and fallbacks
 */

import { fal } from 'https://esm.sh/@fal-ai/client@1.2.1';

export class SchemaManager {
    constructor() {
        this.schemas = new Map(); // In-memory cache
        this.fallbackSchemas = this._getFallbackSchemas();
        this.apiKey = null;
    }

    /**
     * Set API key for authenticated requests
     */
    setApiKey(key) {
        this.apiKey = key;
        if (key) {
            fal.config({ credentials: key });
        }
    }

    /**
     * Fetch OpenAPI schema for a model
     * @param {string} modelId - Model ID (e.g., "fal-ai/nano-banana-pro")
     * @returns {Promise<Object>} Parsed schema with parameters
     */
    async fetchSchema(modelId) {
        // Check in-memory cache first
        if (this.schemas.has(modelId)) {
            return this.schemas.get(modelId);
        }

        // Check sessionStorage
        const cached = sessionStorage.getItem(`schema_${modelId}`);
        if (cached) {
            try {
                const schema = JSON.parse(cached);
                this.schemas.set(modelId, schema);
                return schema;
            } catch (e) {
                console.warn('Failed to parse cached schema:', e);
            }
        }

        // Only fetch schemas for FAL models from FAL.ai API
        // For other providers (Wisdom Gate, Kie.ai, etc.), return minimal schema
        if (!modelId.startsWith('fal-ai/') && !modelId.startsWith('openrouter/')) {
            console.log(`[SchemaManager] Non-FAL model ${modelId}, using minimal schema`);
            const minimalSchema = { parameters: [], raw: null };
            this.schemas.set(modelId, minimalSchema);
            return minimalSchema;
        }

        // Fetch from FAL.ai API using REST API
        try {
            console.log(`[SchemaManager] Fetching schema for ${modelId}...`);
            
            // Use REST API directly (SDK doesn't have schema() method)
            const headers = {
                'Content-Type': 'application/json'
            };
            
            // FAL.ai uses "Key" prefix, not "Bearer"
            if (this.apiKey) {
                headers['Authorization'] = `Key ${this.apiKey}`;
            }
            
            const response = await fetch(
                `https://api.fal.ai/v1/models?endpoint_id=${encodeURIComponent(modelId)}&expand=openapi-3.0`,
                { headers }
            );

            if (!response.ok) {
                throw new Error(`Schema fetch failed: ${response.status}`);
            }

            const schemaData = await response.json();

            const schema = this._parseSchema(schemaData, modelId);

            // If parsing returned minimal schema (no real schema found), use fallback instead
            if (!schema.raw && this.fallbackSchemas.has(modelId)) {
                console.log(`[SchemaManager] API returned no schema, using fallback for ${modelId}`);
                const fallback = this.fallbackSchemas.get(modelId);
                this.schemas.set(modelId, fallback);
                sessionStorage.setItem(`schema_${modelId}`, JSON.stringify(fallback));
                return fallback;
            }

            // Cache it
            this.schemas.set(modelId, schema);
            sessionStorage.setItem(`schema_${modelId}`, JSON.stringify(schema));

            console.log(`[SchemaManager] Schema fetched successfully for ${modelId}`);
            return schema;

        } catch (error) {
            console.error(`[SchemaManager] Failed to fetch schema for ${modelId}:`, error);

            // Return fallback if available
            if (this.fallbackSchemas.has(modelId)) {
                console.log(`[SchemaManager] Using fallback schema for ${modelId}`);
                const fallback = this.fallbackSchemas.get(modelId);
                // Cache the fallback
                this.schemas.set(modelId, fallback);
                return fallback;
            }

            // Return minimal schema
            return this._getMinimalSchema(modelId);
        }
    }

    /**
     * Parse OpenAPI schema into our internal format
     * @private
     */
    _parseSchema(data, modelId) {
        // Handle different response formats from fal.schema() vs REST API
        let inputSchema;
        
        // Try different schema locations
        if (data.components?.schemas?.Input) {
            // OpenAPI format from REST API
            inputSchema = data.components.schemas.Input;
        } else if (data.openapi_schema?.components?.schemas?.Input) {
            // Nested OpenAPI format
            inputSchema = data.openapi_schema.components.schemas.Input;
        } else if (data.properties) {
            // Direct schema object (from fal.schema())
            inputSchema = data;
        } else if (data.paths?.['/']?.post?.requestBody?.content?.['application/json']?.schema) {
            // OpenAPI paths format
            inputSchema = data.paths['/'].post.requestBody.content['application/json'].schema;
        } else if (data.openapi_schema) {
            // Try parsing openapi_schema directly
            const openapi = data.openapi_schema;
            inputSchema = openapi.components?.schemas?.Input || 
                         openapi.paths?.['/']?.post?.requestBody?.content?.['application/json']?.schema;
        }

        if (!inputSchema) {
            console.warn(`[SchemaManager] No input schema found for ${modelId}`, data);
            // Check fallback schemas before returning minimal
            if (this.fallbackSchemas.has(modelId)) {
                console.log(`[SchemaManager] Using fallback schema for ${modelId} (from _parseSchema)`);
                return this.fallbackSchemas.get(modelId);
            }
            return this._getMinimalSchema(modelId);
        }

        const parameters = {};
        const properties = inputSchema.properties || {};
        const required = inputSchema.required || [];

        for (const [key, prop] of Object.entries(properties)) {
            // Handle oneOf/anyOf for union types
            const oneOf = prop.oneOf || prop.anyOf;
            
            parameters[key] = {
                name: key,
                type: oneOf ? 'union' : (prop.type || 'string'),
                description: prop.description || '',
                default: prop.default,
                enum: prop.enum,
                required: required.includes(key),
                minimum: prop.minimum,
                maximum: prop.maximum,
                pattern: prop.pattern,
                // Handle union types (oneOf, anyOf)
                oneOf: prop.oneOf,
                anyOf: prop.anyOf,
                // Handle object types (for custom width/height)
                properties: prop.properties,
                // Categorize as basic or advanced
                category: this._categorizeParameter(key)
            };
        }

        return {
            modelId,
            parameters,
            required,
            raw: inputSchema
        };
    }

    /**
     * Categorize parameters as 'basic' or 'advanced'
     * @private
     */
    _categorizeParameter(paramName) {
        // Exclude num_images - it's controlled by "Number of Pairs" in the sidebar, not model config
        if (paramName === 'num_images') {
            return 'hidden';
        }

        const basicParams = [
            'prompt',
            'image_url',
            'image_urls',
            'aspect_ratio',
            'resolution',
            'image_size',
            'quality',
            'guidance_scale',
            'num_inference_steps'
        ];

        return basicParams.includes(paramName) ? 'basic' : 'advanced';
    }

    /**
     * Get minimal fallback schema when API fails
     * @private
     */
    _getMinimalSchema(modelId) {
        return {
            modelId,
            parameters: {
                prompt: {
                    name: 'prompt',
                    type: 'string',
                    description: 'Text prompt for image generation',
                    required: true,
                    category: 'basic'
                },
                aspect_ratio: {
                    name: 'aspect_ratio',
                    type: 'string',
                    enum: ['1:1', '16:9', '9:16', '4:3', '3:4', 'auto'],
                    default: '1:1',
                    category: 'basic'
                },
                resolution: {
                    name: 'resolution',
                    type: 'string',
                    enum: ['1K', '2K', '4K'],
                    default: '2K',
                    category: 'basic'
                }
            },
            required: ['prompt'],
            raw: null
        };
    }

    /**
     * Static fallback schemas for known models
     * @private
     */
    _getFallbackSchemas() {
        const fallbacks = new Map();

        // Nano Banana Pro
        fallbacks.set('fal-ai/nano-banana-pro', {
            modelId: 'fal-ai/nano-banana-pro',
            parameters: {
                prompt: {
                    name: 'prompt',
                    type: 'string',
                    description: 'Text prompt for image generation',
                    required: true,
                    category: 'basic'
                },
                aspect_ratio: {
                    name: 'aspect_ratio',
                    type: 'string',
                    enum: ['1:1', '16:9', '9:16', '4:3', '3:4', 'auto'],
                    default: '1:1',
                    category: 'basic'
                },
                resolution: {
                    name: 'resolution',
                    type: 'string',
                    enum: ['1K', '2K', '4K'],
                    default: '2K',
                    category: 'basic'
                },
                num_images: {
                    name: 'num_images',
                    type: 'integer',
                    default: 1,
                    minimum: 1,
                    maximum: 4,
                    category: 'hidden' // Excluded from UI - controlled by "Number of Pairs" in sidebar
                },
                enable_safety_checker: {
                    name: 'enable_safety_checker',
                    type: 'boolean',
                    default: true,
                    category: 'advanced'
                },
                seed: {
                    name: 'seed',
                    type: 'integer',
                    description: 'Random seed for reproducibility',
                    category: 'advanced'
                }
            },
            required: ['prompt']
        });

        // Seedream v4.5
        fallbacks.set('fal-ai/bytedance/seedream/v4.5/text-to-image', {
            modelId: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
            parameters: {
                prompt: {
                    name: 'prompt',
                    type: 'string',
                    description: 'Text prompt for image generation',
                    required: true,
                    category: 'basic'
                },
                image_size: {
                    name: 'image_size',
                    type: 'union',
                    description: 'Image size (preset or custom)',
                    oneOf: [
                        {
                            type: 'string',
                            enum: ['square', 'square_hd', 'portrait', 'landscape', 'auto_2K', 'auto_4K']
                        },
                        {
                            type: 'object',
                            properties: {
                                width: { type: 'integer', minimum: 256, maximum: 2048 },
                                height: { type: 'integer', minimum: 256, maximum: 2048 }
                            }
                        }
                    ],
                    default: 'square_hd',
                    category: 'basic'
                },
                num_images: {
                    name: 'num_images',
                    type: 'integer',
                    default: 1,
                    minimum: 1,
                    maximum: 4,
                    category: 'hidden' // Excluded from UI - controlled by "Number of Pairs" in sidebar
                },
                enable_safety_checker: {
                    name: 'enable_safety_checker',
                    type: 'boolean',
                    default: false,
                    category: 'advanced'
                },
                seed: {
                    name: 'seed',
                    type: 'integer',
                    description: 'Random seed for reproducibility',
                    category: 'advanced'
                }
            },
            required: ['prompt']
        });

        return fallbacks;
    }

    /**
     * Clear all cached schemas
     */
    clearCache() {
        this.schemas.clear();
        // Clear sessionStorage schemas
        const keys = Object.keys(sessionStorage);
        keys.forEach(key => {
            if (key.startsWith('schema_')) {
                sessionStorage.removeItem(key);
            }
        });
    }

    /**
     * Get parameter by name from a schema
     */
    getParameter(schema, paramName) {
        return schema.parameters?.[paramName];
    }

    /**
     * Get all parameters of a category
     */
    getParametersByCategory(schema, category) {
        const params = {};
        for (const [key, param] of Object.entries(schema.parameters || {})) {
            if (param.category === category) {
                params[key] = param;
            }
        }
        return params;
    }
}

// Singleton instance
export const schemaManager = new SchemaManager();


