/**
 * UIGenerator - Renders dynamic form controls based on OpenAPI schemas
 * Supports preset/custom toggles, collapsible sections, and state management
 */

export class UIGenerator {
    constructor(schemaManager) {
        this.schemaManager = schemaManager;
        this.currentModelId = null;
        this.currentSchema = null;
        this.parameterValues = new Map(); // Key: "modelId.paramName"
        this.unionModes = new Map(); // Key: "modelId.paramName", Value: "preset" or "custom"
        this.loadSavedValues();
    }

    /**
     * Load saved custom values from localStorage
     */
    loadSavedValues() {
        const saved = localStorage.getItem('custom_parameter_values');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.parameterValues = new Map(Object.entries(data));
            } catch (e) {
                console.warn('Failed to load saved parameter values:', e);
            }
        }
    }

    /**
     * Save custom values to localStorage
     */
    saveValues() {
        const data = Object.fromEntries(this.parameterValues);
        localStorage.setItem('custom_parameter_values', JSON.stringify(data));
    }

    /**
     * Render UI for a model
     * @param {string} modelId - Model ID
     * @param {string} containerId - DOM container ID
     */
    async renderUI(modelId, containerId = 'modelParametersPanel') {
        this.currentModelId = modelId;
        this.currentSchema = await this.schemaManager.fetchSchema(modelId);

        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container #${containerId} not found`);
            return;
        }

        // Find the dynamic parameters section (don't clear the whole container)
        const dynamicSection = document.getElementById('dynamicParametersSection');
        if (!dynamicSection) {
            console.error('Dynamic parameters section not found');
            return;
        }

        // Clear previous dynamic parameters
        dynamicSection.innerHTML = '';

        // Create content area for parameters
        const content = document.createElement('div');
        content.className = 'parameters-content';

        // Basic parameters (always visible)
        const basicParams = this.schemaManager.getParametersByCategory(this.currentSchema, 'basic');
        if (Object.keys(basicParams).length > 0) {
            const basicSection = this._createSection('Basic Parameters', basicParams, false);
            content.appendChild(basicSection);
        }

        // Advanced parameters (collapsible)
        const advancedParams = this.schemaManager.getParametersByCategory(this.currentSchema, 'advanced');
        if (Object.keys(advancedParams).length > 0) {
            const advancedSection = this._createSection('Advanced Parameters', advancedParams, true);
            content.appendChild(advancedSection);
        }
        
        // Note: 'hidden' category parameters (like num_images) are excluded from UI
        // num_images is controlled by "Number of Pairs" in the sidebar

        dynamicSection.appendChild(content);

        // Show the panel (remove hidden class)
        container.classList.remove('hidden');
        
        // Setup toggle for the unified panel
        this._setupPanelToggle();
    }

    /**
     * Setup toggle for the unified model config panel
     * @private
     */
    _setupPanelToggle() {
        const toggleBtn = document.getElementById('modelConfigToggle');
        const content = document.getElementById('modelConfigContent');
        
        if (toggleBtn && content) {
            toggleBtn.onclick = () => {
                const isHidden = content.style.display === 'none';
                content.style.display = isHidden ? 'block' : 'none';
                toggleBtn.innerHTML = isHidden ? '▼' : '▶';
            };
        }
    }

    /**
     * Create a section (basic or advanced)
     * @private
     */
    _createSection(title, parameters, collapsible = false) {
        const section = document.createElement('div');
        section.className = 'param-section';

        if (collapsible) {
            const header = document.createElement('div');
            header.className = 'param-section-header';
            header.innerHTML = `<span class="toggle-icon">▶</span> ${title}`;
            header.onclick = () => {
                const content = section.querySelector('.param-section-content');
                const icon = header.querySelector('.toggle-icon');
                const isCollapsed = content.style.display === 'none';
                content.style.display = isCollapsed ? 'grid' : 'none';
                icon.textContent = isCollapsed ? '▼' : '▶';
            };
            section.appendChild(header);
        } else {
            const header = document.createElement('h4');
            header.textContent = title;
            header.style.marginBottom = '12px';
            section.appendChild(header);
        }

        const content = document.createElement('div');
        content.className = 'param-section-content param-grid';
        if (collapsible) {
            content.style.display = 'none'; // Start collapsed
        }

        // Render each parameter
        for (const [key, param] of Object.entries(parameters)) {
            // Skip prompt and image_url(s) - handled separately in app
            if (['prompt', 'image_url', 'image_urls'].includes(key)) continue;

            const control = this._createControl(param);
            content.appendChild(control);
        }

        section.appendChild(content);
        return section;
    }

    /**
     * Create a form control for a parameter
     * @private
     */
    _createControl(param) {
        const wrapper = document.createElement('div');
        wrapper.className = 'param-control';

        const label = document.createElement('label');
        label.className = 'param-label';
        label.textContent = this._formatLabel(param.name);
        if (param.required) {
            label.innerHTML += ' <span style="color: var(--error)">*</span>';
        }
        wrapper.appendChild(label);

        // Description tooltip
        if (param.description) {
            const desc = document.createElement('small');
            desc.className = 'param-description';
            desc.textContent = param.description;
            wrapper.appendChild(desc);
        }

        // Determine control type
        let control;

        if (param.oneOf || param.anyOf) {
            // Union type - needs toggle between preset and custom
            control = this._createUnionControl(param);
        } else if (param.enum) {
            // Enum - dropdown
            control = this._createEnumControl(param);
        } else if (param.type === 'boolean') {
            // Boolean - checkbox
            control = this._createBooleanControl(param);
        } else if (param.type === 'integer' || param.type === 'number') {
            // Number - number input
            control = this._createNumberControl(param);
        } else {
            // String - text input
            control = this._createTextControl(param);
        }

        wrapper.appendChild(control);
        return wrapper;
    }

    /**
     * Create union control (preset/custom toggle)
     * @private
     */
    _createUnionControl(param) {
        const container = document.createElement('div');
        container.className = 'union-control';

        const unionOptions = param.oneOf || param.anyOf;
        const enumOption = unionOptions.find(opt => opt.enum);
        const objectOption = unionOptions.find(opt => opt.type === 'object' || opt.properties);

        // Toggle buttons
        const toggle = document.createElement('div');
        toggle.className = 'union-toggle';

        const presetBtn = document.createElement('button');
        presetBtn.textContent = 'Presets';
        presetBtn.className = 'union-toggle-btn active';
        presetBtn.type = 'button';

        const customBtn = document.createElement('button');
        customBtn.textContent = 'Custom';
        customBtn.className = 'union-toggle-btn';
        customBtn.type = 'button';

        const valueKey = `${this.currentModelId}.${param.name}`;
        const mode = this.unionModes.get(valueKey) || 'preset';

        if (mode === 'custom') {
            presetBtn.classList.remove('active');
            customBtn.classList.add('active');
        }

        // Preset dropdown
        const presetControl = document.createElement('select');
        presetControl.className = 'param-input';
        presetControl.id = `param_${param.name}_preset`;
        if (enumOption && enumOption.enum) {
            enumOption.enum.forEach(value => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = this._formatLabel(value);
                presetControl.appendChild(option);
            });
        }
        presetControl.value = param.default || (enumOption?.enum?.[0]);

        // Custom inputs (for width/height)
        const customControl = document.createElement('div');
        customControl.className = 'custom-dimensions';
        customControl.style.display = 'none';

        if (objectOption && objectOption.properties) {
            const props = objectOption.properties;
            for (const [propKey, propDef] of Object.entries(props)) {
                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'param-input param-input-sm';
                input.id = `param_${param.name}_${propKey}`;
                input.placeholder = this._formatLabel(propKey);
                input.min = propDef.minimum || 0;
                input.max = propDef.maximum || 10000;
                input.value = propDef.default || (propKey === 'width' ? 1024 : 1024);

                const label = document.createElement('label');
                label.className = 'param-sublabel';
                label.textContent = this._formatLabel(propKey);
                label.appendChild(input);

                customControl.appendChild(label);
            }
        }

        // Toggle logic
        presetBtn.onclick = () => {
            presetBtn.classList.add('active');
            customBtn.classList.remove('active');
            presetControl.style.display = 'block';
            customControl.style.display = 'none';
            this.unionModes.set(valueKey, 'preset');
        };

        customBtn.onclick = () => {
            customBtn.classList.remove('active');
            presetBtn.classList.add('active');
            presetControl.style.display = 'none';
            customControl.style.display = 'grid';
            this.unionModes.set(valueKey, 'custom');
        };

        toggle.appendChild(presetBtn);
        toggle.appendChild(customBtn);

        container.appendChild(toggle);
        container.appendChild(presetControl);
        container.appendChild(customControl);

        // Set initial state
        if (mode === 'custom') {
            presetControl.style.display = 'none';
            customControl.style.display = 'grid';
        }

        return container;
    }

    /**
     * Create enum dropdown
     * @private
     */
    _createEnumControl(param) {
        const select = document.createElement('select');
        select.className = 'param-input';
        select.id = `param_${param.name}`;

        param.enum.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = this._formatLabel(value);
            select.appendChild(option);
        });

        // Set default or saved value
        const saved = this.parameterValues.get(`${this.currentModelId}.${param.name}`);
        select.value = saved || param.default || param.enum[0];

        // Save on change
        select.onchange = () => {
            this.parameterValues.set(`${this.currentModelId}.${param.name}`, select.value);
            this.saveValues();
        };

        return select;
    }

    /**
     * Create boolean checkbox
     * @private
     */
    _createBooleanControl(param) {
        const label = document.createElement('label');
        label.className = 'checkbox-label';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `param_${param.name}`;

        const saved = this.parameterValues.get(`${this.currentModelId}.${param.name}`);
        checkbox.checked = saved !== undefined ? saved === 'true' : (param.default || false);

        checkbox.onchange = () => {
            this.parameterValues.set(`${this.currentModelId}.${param.name}`, checkbox.checked.toString());
            this.saveValues();
        };

        const span = document.createElement('span');
        span.textContent = 'Enable';

        label.appendChild(checkbox);
        label.appendChild(span);

        return label;
    }

    /**
     * Create number input
     * @private
     */
    _createNumberControl(param) {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'param-input';
        input.id = `param_${param.name}`;

        if (param.minimum !== undefined) input.min = param.minimum;
        if (param.maximum !== undefined) input.max = param.maximum;
        if (param.type === 'integer') input.step = '1';

        const saved = this.parameterValues.get(`${this.currentModelId}.${param.name}`);
        input.value = saved || param.default || '';

        input.onchange = () => {
            this.parameterValues.set(`${this.currentModelId}.${param.name}`, input.value);
            this.saveValues();
        };

        return input;
    }

    /**
     * Create text input
     * @private
     */
    _createTextControl(param) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'param-input';
        input.id = `param_${param.name}`;

        const saved = this.parameterValues.get(`${this.currentModelId}.${param.name}`);
        input.value = saved || param.default || '';

        if (param.pattern) {
            input.pattern = param.pattern;
        }

        input.onchange = () => {
            this.parameterValues.set(`${this.currentModelId}.${param.name}`, input.value);
            this.saveValues();
        };

        return input;
    }

    /**
     * Format label text (snake_case to Title Case)
     * @private
     */
    _formatLabel(text) {
        return text
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Get all parameter values for current model
     * @returns {Object} Parameter key-value pairs
     */
    getValues() {
        if (!this.currentSchema) return {};

        const values = {};

        for (const [key, param] of Object.entries(this.currentSchema.parameters)) {
            // Skip prompt and image_url(s)
            if (['prompt', 'image_url', 'image_urls'].includes(key)) continue;

            const valueKey = `${this.currentModelId}.${key}`;

            // Handle union types
            if (param.oneOf || param.anyOf) {
                const mode = this.unionModes.get(valueKey) || 'preset';
                if (mode === 'preset') {
                    const select = document.getElementById(`param_${key}_preset`);
                    if (select) values[key] = select.value;
                } else {
                    // Custom object (width/height)
                    const unionOptions = param.oneOf || param.anyOf;
                    const objectOption = unionOptions.find(opt => opt.type === 'object' || opt.properties);
                    if (objectOption && objectOption.properties) {
                        const obj = {};
                        for (const propKey of Object.keys(objectOption.properties)) {
                            const input = document.getElementById(`param_${key}_${propKey}`);
                            if (input) obj[propKey] = parseInt(input.value);
                        }
                        values[key] = obj;
                    }
                }
            } else {
                // Regular parameter
                const element = document.getElementById(`param_${key}`);
                if (element) {
                    if (param.type === 'boolean') {
                        values[key] = element.checked;
                    } else if (param.type === 'integer') {
                        values[key] = parseInt(element.value);
                    } else if (param.type === 'number') {
                        values[key] = parseFloat(element.value);
                    } else {
                        values[key] = element.value;
                    }
                }
            }
        }

        return values;
    }

    /**
     * Hide the parameters panel
     */
    hide() {
        const panel = document.getElementById('modelParametersPanel');
        if (panel) panel.classList.add('hidden');
    }

    /**
     * Clear all saved values
     */
    clearSavedValues() {
        this.parameterValues.clear();
        this.unionModes.clear();
        localStorage.removeItem('custom_parameter_values');
    }
}


