/**
 * ParameterMapper - Translates UI parameter values to provider-specific API formats
 * Handles model differences (Nano Banana, Seedream, Flux, etc.)
 */

export class ParameterMapper {
    constructor() {
        this.modelMappings = this._getModelMappings();
    }

    /**
     * Map dynamic parameters for a specific model and provider
     * @param {string} modelId - Model ID
     * @param {string} providerId - Provider ID (fal, kie, etc.)
     * @param {Object} uiParams - Parameters from UIGenerator
     * @param {Object} staticParams - Static params (prompt, image_url, etc.)
     * @returns {Object} Mapped parameters ready for API
     */
    mapParameters(modelId, providerId, uiParams, staticParams = {}) {
        // Start with static params
        const params = { ...staticParams };

        // Get model-specific mapping function
        const mapping = this.modelMappings.get(modelId);
        if (mapping) {
            return mapping(providerId, uiParams, params);
        }

        // Default: passthrough (no special mapping needed)
        return { ...params, ...uiParams };
    }

    /**
     * Define model-specific mappings
     * @private
     */
    _getModelMappings() {
        const mappings = new Map();

        // Nano Banana Pro - Direct passthrough
        mappings.set('fal-ai/nano-banana-pro', (providerId, uiParams, params) => {
            return {
                ...params,
                aspect_ratio: uiParams.aspect_ratio || '1:1',
                resolution: uiParams.resolution || '2K',
                num_images: uiParams.num_images || 1,
                enable_safety_checker: uiParams.enable_safety_checker !== undefined 
                    ? uiParams.enable_safety_checker 
                    : false,
                ...(uiParams.seed !== undefined && { seed: uiParams.seed })
            };
        });

        // Seedream v4.5 - Different mapping for FAL vs Kie
        mappings.set('fal-ai/bytedance/seedream/v4.5/text-to-image', (providerId, uiParams, params) => {
            if (providerId === 'kie') {
                // Kie.ai: Uses aspect_ratio + quality
                return {
                    ...params,
                    aspect_ratio: this._mapSeedreamSizeToAspectRatio(uiParams.image_size),
                    quality: this._mapResolutionToQuality(uiParams.image_size),
                    ...(uiParams.seed !== undefined && { seed: uiParams.seed })
                };
            } else {
                // FAL.ai: Uses image_size (preset or object)
                return {
                    ...params,
                    image_size: uiParams.image_size || 'square_hd',
                    num_images: uiParams.num_images || 1,
                    enable_safety_checker: uiParams.enable_safety_checker !== undefined 
                        ? uiParams.enable_safety_checker 
                        : false,
                    ...(uiParams.seed !== undefined && { seed: uiParams.seed })
                };
            }
        });

        // Flux 2 Flex
        mappings.set('fal-ai/flux-2-flex', (providerId, uiParams, params) => {
            return {
                ...params,
                aspect_ratio: uiParams.aspect_ratio || '1:1',
                resolution: uiParams.resolution || '2K',
                num_images: uiParams.num_images || 1,
                enable_safety_checker: uiParams.enable_safety_checker !== undefined 
                    ? uiParams.enable_safety_checker 
                    : false,
                ...(uiParams.seed !== undefined && { seed: uiParams.seed })
            };
        });

        // Flux Dev
        mappings.set('fal-ai/flux/dev', (providerId, uiParams, params) => {
            return {
                ...params,
                image_size: uiParams.image_size || 'square_hd',
                num_inference_steps: uiParams.num_inference_steps || 28,
                guidance_scale: uiParams.guidance_scale !== undefined 
                    ? uiParams.guidance_scale 
                    : 3.5,
                num_images: uiParams.num_images || 1,
                enable_safety_checker: uiParams.enable_safety_checker !== undefined 
                    ? uiParams.enable_safety_checker 
                    : true,
                ...(uiParams.seed !== undefined && { seed: uiParams.seed })
            };
        });

        // Flux Schnell
        mappings.set('fal-ai/flux/schnell', (providerId, uiParams, params) => {
            return {
                ...params,
                image_size: uiParams.image_size || 'square_hd',
                num_inference_steps: uiParams.num_inference_steps || 4,
                num_images: uiParams.num_images || 1,
                enable_safety_checker: uiParams.enable_safety_checker !== undefined 
                    ? uiParams.enable_safety_checker 
                    : true,
                ...(uiParams.seed !== undefined && { seed: uiParams.seed })
            };
        });

        return mappings;
    }

    /**
     * Map Seedream image_size to aspect_ratio for Kie.ai
     * @private
     */
    _mapSeedreamSizeToAspectRatio(imageSize) {
        if (typeof imageSize === 'object' && imageSize.width && imageSize.height) {
            const ratio = imageSize.width / imageSize.height;
            if (ratio === 1) return '1:1';
            if (ratio > 1.5) return '16:9';
            if (ratio < 0.7) return '9:16';
            return '4:3';
        }

        // Preset sizes
        const mapping = {
            'square': '1:1',
            'square_hd': '1:1',
            'portrait': '9:16',
            'landscape': '16:9',
            'auto_2K': 'auto',
            'auto_4K': 'auto'
        };

        return mapping[imageSize] || '1:1';
    }

    /**
     * Map Seedream image_size to quality for Kie.ai
     * @private
     */
    _mapResolutionToQuality(imageSize) {
        if (typeof imageSize === 'string') {
            return imageSize.includes('4K') ? 'high' : 'basic';
        }
        return 'basic'; // Default for custom dimensions
    }

    /**
     * Validate parameters against schema constraints
     * @param {Object} schema - Schema from SchemaManager
     * @param {Object} params - Mapped parameters
     * @returns {Object} { valid: boolean, errors: string[] }
     */
    validateParameters(schema, params) {
        const errors = [];

        for (const [key, param] of Object.entries(schema.parameters)) {
            const value = params[key];

            // Check required
            if (param.required && (value === undefined || value === null || value === '')) {
                errors.push(`${param.name} is required`);
                continue;
            }

            // Skip if not provided
            if (value === undefined || value === null) continue;

            // Validate type
            if (param.type === 'integer' && !Number.isInteger(value)) {
                errors.push(`${param.name} must be an integer`);
            }

            if (param.type === 'number' && typeof value !== 'number') {
                errors.push(`${param.name} must be a number`);
            }

            if (param.type === 'boolean' && typeof value !== 'boolean') {
                errors.push(`${param.name} must be a boolean`);
            }

            // Validate constraints
            if (param.minimum !== undefined && value < param.minimum) {
                errors.push(`${param.name} must be at least ${param.minimum}`);
            }

            if (param.maximum !== undefined && value > param.maximum) {
                errors.push(`${param.name} must be at most ${param.maximum}`);
            }

            // Validate enum
            if (param.enum && !param.enum.includes(value)) {
                errors.push(`${param.name} must be one of: ${param.enum.join(', ')}`);
            }

            // Validate pattern
            if (param.pattern && typeof value === 'string') {
                const regex = new RegExp(param.pattern);
                if (!regex.test(value)) {
                    errors.push(`${param.name} does not match required pattern`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Extract legacy parameters for backward compatibility
     * Maps dynamic params back to old static format
     * @param {Object} params - Mapped parameters
     * @returns {Object} { aspectRatio, resolution }
     */
    extractLegacyParams(params) {
        return {
            aspectRatio: params.aspect_ratio || '1:1',
            resolution: params.resolution || '2K'
        };
    }

    /**
     * Get cost multiplier based on parameters
     * Used for dynamic cost estimation
     * @param {Object} params - Mapped parameters
     * @returns {number} Cost multiplier (1.0 = base cost)
     */
    getCostMultiplier(params) {
        let multiplier = 1.0;

        // Resolution multiplier
        if (params.resolution === '4K' || params.quality === 'high') {
            multiplier *= 2.0;
        }

        // Image count multiplier
        if (params.num_images && params.num_images > 1) {
            multiplier *= params.num_images;
        }

        // Custom size multiplier (based on megapixels)
        if (typeof params.image_size === 'object' && params.image_size.width && params.image_size.height) {
            const megapixels = (params.image_size.width * params.image_size.height) / 1000000;
            if (megapixels > 4) {
                multiplier *= 1.5;
            }
        }

        return multiplier;
    }
}

// Singleton instance
export const parameterMapper = new ParameterMapper();



