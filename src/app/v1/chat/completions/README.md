# Chat Completions API Bridge

This directory contains the implementation of an OpenAI-compatible Chat Completions API that bridges external requests to the internal Flow execution system.

## Features

- OpenAI-compatible API endpoint for chat completions
- Support for both GET and POST request methods
- Flow-based execution using the `flow-[FlowName]` model format
- Rate limiting to prevent abuse
- Detailed logging for monitoring and debugging
- Error handling with appropriate status codes
- Support for streaming responses using Server-Sent Events (SSE) (Note: Streaming implementation needs review with current step-by-step logic)
- Token usage tracking and reporting
- Stateful conversation handling via `conversationId` in metadata
- Optional tool call approval flow via `requireApproval` in metadata
- Debugger support via `flujodebug` in metadata

## Architecture

The Chat Completions API Bridge consists of several main components:

```
route.ts               - HTTP route handlers and rate limiting
├── requestParser.ts   - Parses and validates incoming requests, including metadata flags
└── chatCompletionService.ts - Core service for processing requests, managing state, and executing flow steps
```

The service interacts with the `FlowExecutor` and backend storage (`db/conversations`) to manage and persist conversation state (`SharedState`).

### Component Responsibilities

1. **route.ts**: Handles HTTP routing, rate limiting, and high-level error handling
2. **requestParser.ts**: Parses and validates request parameters from both GET and POST requests, extracting flags like `flujo`, `conversationId`, `requireApproval`, and `flujodebug` from the `metadata` object in POST requests.
3. **chatCompletionService.ts**: Processes chat completion requests step-by-step using `FlowExecutor`. It handles state loading/saving, internal tool processing (if `flujo=true` and `requireApproval=false`), pausing for approval (if `flujo=true` and `requireApproval=true`), pausing for debugging (if `flujodebug=true`), and formatting the final OpenAI-compatible response or intermediate state responses.

## Usage

### Basic Request

```typescript
// Example POST request to the chat completions endpoint
const response = await fetch('/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'flow-MyCustomFlow',
    messages: [
      { role: 'user', content: 'Hello, how can you help me today?' }
    ],
    temperature: 0.7
  })
});

const result = await response.json();
```

### Streaming Request

```typescript
// Example streaming request
const response = await fetch('/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'flow-MyCustomFlow',
    messages: [
      { role: 'user', content: 'Write a story about a space adventure.' }
    ],
    stream: true,
    temperature: 0.7
  })
});

// Process the streaming response
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  // Process each SSE chunk
  // Format: data: {...}\n\n
}
```

### Simple GET Request

```typescript
// Example GET request (simplified interface)
const response = await fetch('/v1/chat/completions?model=flow-MyCustomFlow&message=Hello&temperature=0.7');
const result = await response.json();
```

## Request Format

### POST Request

```typescript
interface ChatCompletionRequest {
  model: string;           // Required: Format 'flow-[FlowName]'
  messages: Array<{        // Required: Array of message objects
    role: string;          // 'user', 'assistant', or 'system'
    content: string;       // The message content
    name?: string;         // Optional: Name of the sender
  }>;
  stream?: boolean;        // Optional: Whether to stream the response
  temperature?: number;    // Optional: Controls randomness (0-1)
  max_tokens?: number;     // Optional: Maximum tokens to generate
  top_p?: number;          // Optional: Controls diversity via nucleus sampling
  frequency_penalty?: number; // Optional: Reduces repetition of token sequences
    presence_penalty?: number;  // Optional: Reduces repetition of topics
    user?: string;           // Optional: User identifier
    metadata?: {           // Optional: For Flujo-specific features
      flujo?: "true";        // Indicates an internal call from the Flujo UI
      conversationId?: string; // ID for resuming or continuing a conversation state
      requireApproval?: "true"; // If true and flujo=true, pauses execution for tool approval
      flujodebug?: "true";    // If true, enables step-by-step debugging mode
    };
}
```

### GET Request

The GET endpoint accepts the following query parameters:

- `model`: The flow model to use (format: 'flow-[FlowName]')
- `message`: The user message content
- `stream`: Whether to stream the response ('true' or 'false')
- `temperature`: Controls randomness (0-1)
- `max_tokens`: Maximum tokens to generate

## Response Format

### Standard Response

```typescript
interface ChatCompletionResponse {
  id: string;              // Response identifier
  object: "chat.completion";
  created: number;         // Unix timestamp
  model: string;           // The model used
  choices: Array<{
    index: number;
    message: {
      role: string;        // 'assistant'
      content: string;     // The generated response
    };
    finish_reason: string; // Reason for finishing ('stop', 'length', etc.)
  }>;
  usage: {
    prompt_tokens: number; // Number of tokens in the prompt
    completion_tokens: number; // Number of tokens in the completion
    total_tokens: number;  // Total tokens used
  };

  // --- Non-standard fields returned for internal (flujo=true) calls ---
  messages?: Array<any>; // Full message history (including timestamps) from SharedState
  conversation_id?: string; // The ID of the conversation state used/created
  status?: 'running' | 'awaiting_tool_approval' | 'paused_debug' | 'completed' | 'error'; // Current execution status
  pendingToolCalls?: Array<any>; // Tool calls awaiting approval (if status='awaiting_tool_approval')
  debugState?: any; // Full SharedState object when paused for debugging (if status='paused_debug')
}
```

**Note:** The non-standard fields (`messages`, `conversation_id`, `status`, `pendingToolCalls`, `debugState`) are only returned when the `metadata.flujo` flag is set to `"true"` in the request. These are used by the Flujo frontend to manage the chat UI and state. External applications should primarily rely on the standard OpenAI fields (`id`, `choices`, `created`, `model`, `object`, `usage`).

### Streaming Response

Streaming responses use Server-Sent Events (SSE) format with the following structure:

```
data: {
  "id": "chatcmpl-123",
  "object": "chat.completion.chunk",
  "created": 1677858242,
  "model": "flow-MyCustomFlow",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant"
    },
    "finish_reason": null
  }]
}

data: {
  "id": "chatcmpl-123",
  "object": "chat.completion.chunk",
  "created": 1677858242,
  "model": "flow-MyCustomFlow",
  "choices": [{
    "index": 0,
    "delta": {
      "content": "Hello"
    },
    "finish_reason": null
  }]
}

data: {
  "id": "chatcmpl-123",
  "object": "chat.completion.chunk",
  "created": 1677858242,
  "model": "flow-MyCustomFlow",
  "choices": [{
    "index": 0,
    "delta": {
      "content": " world"
    },
    "finish_reason": null
  }]
}

data: {
  "id": "chatcmpl-123",
  "object": "chat.completion.chunk",
  "created": 1677858242,
  "model": "flow-MyCustomFlow",
  "choices": [{
    "index": 0,
    "delta": {},
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}

data: [DONE]
```

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- `400 Bad Request`: Invalid request format or parameters
- `404 Not Found`: Requested flow not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server-side error

Error response format:

```typescript
interface ErrorResponse {
  error: {
    message: string;       // Human-readable error message
    type: string;          // Error type (e.g., 'invalid_request_error')
    code: string;          // Error code (e.g., 'invalid_model')
    param?: string;        // Parameter that caused the error (if applicable)
    details?: any;         // Additional error details (if available)
  };
}
```

## Rate Limiting

The API implements a simple rate limiting mechanism:

- Default limit: 60 requests per minute per IP address
- Rate limit window: 1 minute (resets at minute boundaries)
- Rate limit exceeded response: 429 status code with error message

## Debugging

The module uses the application's logging system for detailed logging:

```typescript
import { createLogger } from '@/utils/logger';

const log = createLogger('app/v1/chat/completions/component');
```

Log levels used:
- `debug`: Detailed information for debugging
- `info`: General operational information
- `warn`: Warning conditions
- `error`: Error conditions

## Best Practices

1. **Use POST for Complex Requests**: While GET is supported for simple queries, POST is recommended for complex requests with multiple messages or special parameters.

2. **Handle Rate Limits**: Implement exponential backoff and retry logic for rate-limited requests.

3. **Validate Model Format**: Ensure the model parameter follows the `flow-[FlowName]` format.

4. **Implement Proper Error Handling**: Check for error responses and handle them appropriately.

5. **Monitor Token Usage**: Keep track of token usage to optimize requests and manage costs.

6. **Use Streaming for Long Responses**: For long responses, use streaming to provide a better user experience.

7. **Include Appropriate Temperature**: Adjust the temperature parameter based on the desired creativity vs. determinism of responses.
