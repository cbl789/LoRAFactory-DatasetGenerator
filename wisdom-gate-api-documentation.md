# Wisdom Gate (JuheAPI) API Documentation

## Overview

Wisdom Gate provides a unified OpenAI-compatible API interface for accessing multiple AI models including GPT, Claude, Gemini, and specialized image/video generation models.

**Base URL:** `https://wisdom-gate.juheapi.com/v1`

**Dashboard:** https://wisdom-gate.juheapi.com

**Task Management:** https://wisdom-gate.juheapi.com/hall/tasks

---

## Authentication

All API requests require authentication via Bearer token in the Authorization header:

```bash
Authorization: Bearer YOUR_API_KEY
```

Get your API key from the Wisdom Gate dashboard after creating an account.

---

## Core Endpoints

### 1. List Available Models

Get all available models and their capabilities.

**Endpoint:** `GET /v1/models`

**Request:**
```bash
curl -X GET "https://wisdom-gate.juheapi.com/v1/models" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "data": [
    {
      "id": "gemini-3-pro-image-preview",
      "object": "model",
      "created": 1626777600,
      "owned_by": "Google",
      "supported_endpoint_types": ["openai"]
    }
  ]
}
```

**Filter for specific models:**
```bash
curl -X GET "https://wisdom-gate.juheapi.com/v1/models" \
  -H "Authorization: Bearer YOUR_API_KEY" | grep -i "nano"
```

---

### 2. Chat Completions (Text & Image Generation)

Standard OpenAI-compatible endpoint for text generation and image generation.

**Endpoint:** `POST /v1/chat/completions`

#### Text Generation Example

```bash
curl -X POST "https://wisdom-gate.juheapi.com/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "wisdom-ai-gpt5",
    "messages": [
      {
        "role": "user",
        "content": "Hello, how can you help me today?"
      }
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

#### Image Generation Example (Gemini 3 Pro Image)

```bash
curl -X POST "https://wisdom-gate.juheapi.com/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3-pro-image-preview",
    "messages": [
      {
        "role": "user",
        "content": "A serene mountain landscape at sunset"
      }
    ],
    "image_config": {
      "aspect_ratio": "16:9",
      "image_size": "4K"
    },
    "enable_safety_checker": false
  }'
```

**Response Format (Image Generation):**
```json
{
  "id": "foaicmpl-xxx",
  "object": "chat.completion",
  "created": 1765639884,
  "model": "gemini-3-pro-image",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "![image](https://xl-files.oss-cn-chengdu.aliyuncs.com/gemini_business/xxx.png)\n\n"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 14,
    "completion_tokens": 71,
    "total_tokens": 85
  }
}
```

#### Image Understanding (Vision) Example

```bash
curl -X POST "https://wisdom-gate.juheapi.com/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3-pro-image-preview",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Describe this image in detail"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "https://example.com/image.jpg"
            }
          }
        ]
      }
    ]
  }'
```

---

### 3. Video Generation (Sora 2 Pro)

Generate videos from text prompts or images.

**Endpoint:** `POST /v1/videos`

#### Text-to-Video

```bash
curl -X POST "https://wisdom-gate.juheapi.com/v1/videos" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "model=sora-2-pro" \
  -F "prompt=A serene lake surrounded by mountains at sunset" \
  -F "seconds=25" \
  -F "fps=30" \
  -F "width=1920" \
  -F "height=1080"
```

#### Image-to-Video

```bash
curl -X POST "https://wisdom-gate.juheapi.com/v1/videos" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "model=sora-2-pro" \
  -F "image=@/path/to/input.jpg" \
  -F "prompt=Add subtle camera pan and natural motion" \
  -F "seconds=10" \
  -F "fps=30" \
  -F "width=1280" \
  -F "height=720" \
  -F "motion_strength=0.35"
```

**Response:**
```json
{
  "task_id": "abc123-def456-ghi789"
}
```

#### Check Video Generation Status

```bash
curl -X GET "https://wisdom-gate.juheapi.com/v1/videos/{task_id}" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Available Models

### Text Models

| Model ID | Description | Provider |
|----------|-------------|----------|
| `wisdom-ai-gpt5` | Latest GPT-5 model | OpenAI |
| `wisdom-ai-claude-sonnet-4` | Claude Sonnet 4 | Anthropic |
| `deepseek-r1` | Free reasoning model (until 2026) | DeepSeek |
| `deepseek-v3` | Free model (until 2026) | DeepSeek |
| `wisdom-ai-glm4.5` | GLM 4.5 reasoning model | Zhipu AI |

### Image Models

| Model ID | Description | Provider |
|----------|-------------|----------|
| `gemini-3-pro-image-preview` | Nano Banana Pro (image generation & editing) | Google |
| `grok-4-image` | Grok 4 Image generation | xAI |

### Video Models

| Model ID | Description | Provider |
|----------|-------------|----------|
| `sora-2-pro` | Advanced video generation | OpenAI |

---

## Image Generation Parameters

### For Gemini 3 Pro Image Preview

#### Aspect Ratios
- `1:1` - Square
- `2:3`, `3:2` - Standard photo ratios
- `3:4`, `4:3` - Traditional ratios
- `4:5`, `5:4` - Social media formats
- `9:16`, `16:9` - Widescreen/mobile
- `21:9` - Ultra-wide cinematic

#### Image Sizes (Resolution)
- `1K` - Default, fastest (lowest cost)
- `2K` - Higher quality (~$0.13 per image)
- `4K` - Maximum quality (~$0.24 per image)

**⚠️ Important:** Use uppercase `K` (e.g., `4K`, not `4k`)

#### Multi-Image Input
- Up to **14 reference images** per request
- Up to **6 object images** for high-fidelity inclusion
- Up to **5 human subjects** for character consistency
- Maximum **7MB per input image**

#### Safety Settings

**Google Format (Detailed):**
```json
{
  "safety_settings": [
    {
      "category": "HARM_CATEGORY_HARASSMENT",
      "threshold": "BLOCK_NONE"
    },
    {
      "category": "HARM_CATEGORY_HATE_SPEECH",
      "threshold": "BLOCK_NONE"
    },
    {
      "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      "threshold": "BLOCK_NONE"
    },
    {
      "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
      "threshold": "BLOCK_NONE"
    }
  ]
}
```

**Simplified Format:**
```json
{
  "enable_safety_checker": false
}
```

**Threshold Levels:**
- `BLOCK_NONE` - No blocking
- `BLOCK_ONLY_HIGH` - Block only high-risk content
- `BLOCK_MEDIUM_AND_ABOVE` - Block medium and high-risk (default)
- `BLOCK_LOW_AND_ABOVE` - Block low, medium, and high-risk

---

## Video Generation Parameters

### For Sora 2 Pro

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `model` | string | Model identifier | `sora-2-pro` |
| `prompt` | string | Text description of video | `"A serene lake at sunset"` |
| `image` | file | Input image for image-to-video | `@/path/to/image.jpg` |
| `seconds` | integer | Video duration (5-25 recommended) | `10` |
| `fps` | integer | Frames per second (24-60) | `30` |
| `width` | integer | Output width in pixels | `1920` |
| `height` | integer | Output height in pixels | `1080` |
| `motion_strength` | float | Motion intensity (0.0-1.0) | `0.35` |
| `camera_motion` | string | Camera movement instructions | `"slow pan right"` |

---

## Standard Chat Completion Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `model` | string | Model identifier | Required |
| `messages` | array | Conversation messages | Required |
| `temperature` | float | Randomness (0.0-2.0) | `0.7` |
| `max_tokens` | integer | Maximum response length | Model-specific |
| `top_p` | float | Nucleus sampling (0.0-1.0) | `1.0` |
| `stream` | boolean | Enable streaming responses | `false` |
| `presence_penalty` | float | Penalize new topics (-2.0 to 2.0) | `0` |
| `frequency_penalty` | float | Penalize repetition (-2.0 to 2.0) | `0` |

---

## Python Example

```python
import requests
import re

API_KEY = "YOUR_API_KEY"
BASE_URL = "https://wisdom-gate.juheapi.com/v1"

def generate_image(prompt, aspect_ratio="16:9", image_size="4K", safety=False):
    url = f"{BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "gemini-3-pro-image-preview",
        "messages": [{"role": "user", "content": prompt}],
        "image_config": {
            "aspect_ratio": aspect_ratio,
            "image_size": image_size
        },
        "enable_safety_checker": safety
    }
    
    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()
    
    data = response.json()
    content = data['choices'][0]['message']['content']
    
    # Extract image URL from markdown format
    image_url = re.search(r'https://[^)]+\.(png|jpg|jpeg)', content)
    
    if image_url:
        return {
            'url': image_url.group(0),
            'usage': data['usage'],
            'model': data['model']
        }
    
    raise ValueError(f"No image URL found: {content}")

# Usage
result = generate_image("A cyberpunk cityscape at night", "16:9", "4K")
print(f"Image URL: {result['url']}")
print(f"Tokens: {result['usage']['total_tokens']}")
```

---

## Pricing

### Approximate Costs (as of Dec 2024)

**Text Models:**
- ~50% cheaper than official provider rates
- Wisdom Gate offers ~20% savings vs OpenRouter

**Image Generation (Gemini 3 Pro Image):**
- 1K resolution: ~$0.10 per image
- 2K resolution: ~$0.13 per image
- 4K resolution: ~$0.24 per image

**Video Generation (Sora 2 Pro):**
- Per-second pricing
- ~60% cheaper than official OpenAI Sora pricing
- 25-second video: significant cost savings vs direct OpenAI access

**Free Models (until 2026):**
- `deepseek-r1`
- `deepseek-v3`

**Bonus:**
- Recharge bonuses available (extra credits on top-up)

💡 **Check your dashboard for current pricing:** https://wisdom-gate.juheapi.com

---

## Rate Limits & Quotas

- Rate limits vary by account tier
- Free tier available with usage limits
- Set budget alerts in dashboard
- Monitor usage at: https://wisdom-gate.juheapi.com/billing

---

## Best Practices

### Security
- Store API keys in environment variables
- Never commit keys to version control
- Use secret managers for production

### Optimization
- Use conservative `temperature` and `max_tokens` to reduce costs
- Cache system prompts and templates
- Use preview-scale images for faster processing
- Batch non-urgent tasks during off-peak periods

### Image Generation
- Start with 1K resolution for testing
- Use specific, detailed prompts for better results
- Leverage multi-image input for character consistency
- Download generated images promptly (logs retained for 7 days)

### Video Generation
- Test with 10-15 second videos first
- Use asynchronous polling for longer videos
- Monitor task status via dashboard or API
- Download completed videos within retention period

---

## Error Handling

Common HTTP status codes:
- `200` - Success
- `400` - Bad request (invalid parameters)
- `401` - Unauthorized (invalid API key)
- `429` - Rate limit exceeded
- `500` - Server error

Example error response:
```json
{
  "error": {
    "message": "The model 'invalid-model' does not exist",
    "type": "invalid_request_error",
    "param": "model",
    "code": "model_not_found"
  }
}
```

---

## Support & Resources

- **Dashboard:** https://wisdom-gate.juheapi.com
- **Task Manager:** https://wisdom-gate.juheapi.com/hall/tasks
- **Documentation:** https://wisdom-gate.juheapi.com/docs
- **Blog/Guides:** https://www.juheapi.com/blog/

---

## Quick Reference Commands

### List models with filtering
```bash
curl -X GET "https://wisdom-gate.juheapi.com/v1/models" \
  -H "Authorization: Bearer YOUR_API_KEY" | jq '.data[] | select(.id | contains("gemini"))'
```

### Generate image and extract URL
```bash
curl -X POST "https://wisdom-gate.juheapi.com/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3-pro-image-preview",
    "messages": [{"role": "user", "content": "A sunset over mountains"}],
    "image_config": {"aspect_ratio": "16:9", "image_size": "2K"}
  }' | jq -r '.choices[0].message.content' | grep -oP 'https://[^)]+\.png'
```

### Generate video and get task ID
```bash
curl -X POST "https://wisdom-gate.juheapi.com/v1/videos" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "model=sora-2-pro" \
  -F "prompt=Ocean waves at sunset" \
  -F "seconds=15" | jq -r '.task_id'
```

---

## Legal Notice

⚠️ **Important:**
- Follow Wisdom Gate's terms of service
- Comply with local content regulations
- Disabling safety checkers may violate TOS
- Use generated content responsibly
- Respect copyright and intellectual property

---

**Last Updated:** December 2024

**API Version:** v1
