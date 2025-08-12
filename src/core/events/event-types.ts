// Service-level events (global to matrix instance)
export interface ServiceEventMap {
	// Matrix lifecycle events
	'matrix:started': { timestamp: number; version?: string };
	'matrix:stopped': { timestamp: number; reason?: string };
	'matrix:error': { error: string; stack?: string; timestamp: number };

	// Service initialization events
	'matrix:serviceStarted': { serviceType: string; timestamp: number };
	'matrix:serviceError': { serviceType: string; error: string; timestamp: number };
	'matrix:allServicesReady': { timestamp: number; services: string[] };

	// Tool registration events
	'matrix:toolRegistered': { toolName: string; toolType: 'internal' | 'mcp'; timestamp: number };
	'matrix:toolUnregistered': { toolName: string; toolType: 'internal' | 'mcp'; timestamp: number };
	'matrix:toolError': { toolName: string; error: string; timestamp: number };

	// MCP connection events
	'matrix:mcpClientConnected': { clientId: string; serverName: string; timestamp: number };
	'matrix:mcpClientDisconnected': {
		clientId: string;
		serverName: string;
		reason?: string;
		timestamp: number;
	};
	'matrix:mcpClientError': {
		clientId: string;
		serverName: string;
		error: string;
		timestamp: number;
	};

	// Memory operations
	'matrix:memoryOperationStarted': { operation: string; sessionId?: string; timestamp: number };
	'matrix:memoryOperationCompleted': {
		operation: string;
		sessionId?: string;
		duration: number;
		timestamp: number;
	};
	'matrix:memoryOperationFailed': {
		operation: string;
		sessionId?: string;
		error: string;
		timestamp: number;
	};

	// Vector store events
	'matrix:vectorStoreConnected': { provider: string; timestamp: number };
	'matrix:vectorStoreDisconnected': { provider: string; reason?: string; timestamp: number };
	'matrix:vectorStoreError': { provider: string; error: string; timestamp: number };

	// LLM service events
	'matrix:llmProviderRegistered': { provider: string; timestamp: number };
	'matrix:llmProviderError': { provider: string; error: string; timestamp: number };

	// Lazy loading events
	'lazy-memory:loading': { componentType: string; timestamp: number };
	'lazy-memory:loaded': { componentType: string; loadTime: number; timestamp: number };
	'lazy-memory:error': { componentType: string; error: string; timestamp: number };
	'lazy-service:loaded': { serviceType: string; timestamp: number };
	'lazy-service:initialized': { initTime: number; lazyLoadingEnabled: boolean; timestamp: number };
}

// Session-level events (scoped to individual conversations)
export interface SessionEventMap {
	// Session lifecycle
	'session:created': { sessionId: string; timestamp: number };
	'session:activated': { sessionId: string; timestamp: number };
	'session:deactivated': { sessionId: string; timestamp: number };
	'session:expired': { sessionId: string; timestamp: number };
	'session:deleted': { sessionId: string; timestamp: number };

	// Tool execution events
	'tool:executionStarted': {
		toolName: string;
		toolType: 'internal' | 'mcp';
		sessionId: string;
		executionId: string;
		timestamp: number;
	};
	'tool:executionCompleted': {
		toolName: string;
		toolType: 'internal' | 'mcp';
		sessionId: string;
		executionId: string;
		duration: number;
		success: boolean;
		timestamp: number;
	};
	'tool:executionFailed': {
		toolName: string;
		toolType: 'internal' | 'mcp';
		sessionId: string;
		executionId: string;
		error: string;
		duration: number;
		timestamp: number;
	};

	// LLM interaction events
	'llm:thinking': { sessionId: string; messageId: string; timestamp: number };
	'llm:responseStarted': { sessionId: string; messageId: string; model: string; timestamp: number };
	'llm:responseCompleted': {
		sessionId: string;
		messageId: string;
		model: string;
		tokenCount?: number;
		duration: number;
		timestamp: number;
	};
	'llm:responseError': {
		sessionId: string;
		messageId: string;
		model: string;
		error: string;
		timestamp: number;
	};

	// Memory operations (session-scoped)
	'memory:stored': {
		sessionId: string;
		type: 'conversation' | 'embedding' | 'knowledge';
		size: number;
		timestamp: number;
	};
	'memory:retrieved': {
		sessionId: string;
		type: 'conversation' | 'embedding' | 'knowledge';
		count: number;
		timestamp: number;
	};
	'memory:searched': {
		sessionId: string;
		query: string;
		resultCount: number;
		duration: number;
		timestamp: number;
	};

	// Conversation events
	'conversation:messageAdded': {
		sessionId: string;
		messageId: string;
		role: 'user' | 'assistant' | 'system';
		timestamp: number;
	};
	'conversation:messageUpdated': {
		sessionId: string;
		messageId: string;
		timestamp: number;
	};
	'conversation:cleared': { sessionId: string; timestamp: number };

	// Context events
	'context:updated': { sessionId: string; contextSize: number; timestamp: number };
	'context:truncated': { sessionId: string; removedCount: number; timestamp: number };
}

// Event metadata for filtering and routing
export interface EventMetadata {
	timestamp: number;
	sessionId?: string;
	source?: string;
	priority?: 'high' | 'normal' | 'low';
	tags?: string[];
	eventManagerId?: string;
}

// Event envelope for persistence and routing
export interface EventEnvelope<T = any> {
	id: string;
	type: string;
	data: T;
	metadata: EventMetadata;
}

// Event filter function type
export type EventFilter<T = any> = (event: EventEnvelope<T>) => boolean;

// Event transformation function type
export type EventTransformer<T = any, R = any> = (event: EventEnvelope<T>) => EventEnvelope<R>;

// Event constants to prevent typos
export const ServiceEvents = {
	MATRIX_STARTED: 'matrix:started' as const,
	MATRIX_STOPPED: 'matrix:stopped' as const,
	MATRIX_ERROR: 'matrix:error' as const,
	SERVICE_STARTED: 'matrix:serviceStarted' as const,
	SERVICE_ERROR: 'matrix:serviceError' as const,
	ALL_SERVICES_READY: 'matrix:allServicesReady' as const,
	TOOL_REGISTERED: 'matrix:toolRegistered' as const,
	TOOL_UNREGISTERED: 'matrix:toolUnregistered' as const,
	TOOL_ERROR: 'matrix:toolError' as const,
	MCP_CLIENT_CONNECTED: 'matrix:mcpClientConnected' as const,
	MCP_CLIENT_DISCONNECTED: 'matrix:mcpClientDisconnected' as const,
	MCP_CLIENT_ERROR: 'matrix:mcpClientError' as const,
	MEMORY_OPERATION_STARTED: 'matrix:memoryOperationStarted' as const,
	MEMORY_OPERATION_COMPLETED: 'matrix:memoryOperationCompleted' as const,
	MEMORY_OPERATION_FAILED: 'matrix:memoryOperationFailed' as const,
	VECTOR_STORE_CONNECTED: 'matrix:vectorStoreConnected' as const,
	VECTOR_STORE_DISCONNECTED: 'matrix:vectorStoreDisconnected' as const,
	VECTOR_STORE_ERROR: 'matrix:vectorStoreError' as const,
	LLM_PROVIDER_REGISTERED: 'matrix:llmProviderRegistered' as const,
	LLM_PROVIDER_ERROR: 'matrix:llmProviderError' as const,
} as const;

export const SessionEvents = {
	SESSION_CREATED: 'session:created' as const,
	SESSION_ACTIVATED: 'session:activated' as const,
	SESSION_DEACTIVATED: 'session:deactivated' as const,
	SESSION_EXPIRED: 'session:expired' as const,
	SESSION_DELETED: 'session:deleted' as const,
	TOOL_EXECUTION_STARTED: 'tool:executionStarted' as const,
	TOOL_EXECUTION_COMPLETED: 'tool:executionCompleted' as const,
	TOOL_EXECUTION_FAILED: 'tool:executionFailed' as const,
	LLM_THINKING: 'llm:thinking' as const,
	LLM_RESPONSE_STARTED: 'llm:responseStarted' as const,
	LLM_RESPONSE_COMPLETED: 'llm:responseCompleted' as const,
	LLM_RESPONSE_ERROR: 'llm:responseError' as const,
	MEMORY_STORED: 'memory:stored' as const,
	MEMORY_RETRIEVED: 'memory:retrieved' as const,
	MEMORY_SEARCHED: 'memory:searched' as const,
	CONVERSATION_MESSAGE_ADDED: 'conversation:messageAdded' as const,
	CONVERSATION_MESSAGE_UPDATED: 'conversation:messageUpdated' as const,
	CONVERSATION_CLEARED: 'conversation:cleared' as const,
	CONTEXT_UPDATED: 'context:updated' as const,
	CONTEXT_TRUNCATED: 'context:truncated' as const,
} as const;
