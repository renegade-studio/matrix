/**
 * Memory Operation Tool
 *
 * Processes extracted knowledge and determines memory operations (ADD, UPDATE, DELETE, NONE)
 * by analyzing similarity with existing memories and using LLM-powered intelligent reasoning.
 * This tool integrates with embedding, vector storage, and LLM systems for sophisticated
 * memory management with contextual understanding.
 */

import { InternalTool, InternalToolContext } from '../../types.js';
import { logger } from '../../../../logger/index.js';
// Import payload migration utilities
import { createKnowledgePayload } from './payloads.js';

/**
 * MEMORY OPERATIONAL TOOL
 */
export const MEMORY_OPERATION_TOOL = {
	type: 'function',
	function: {
		name: 'memory_operation',
		description:
			'Process extracted knowledge and determine memory operations (ADD, UPDATE, DELETE, NONE) using LLM-powered intelligent reasoning and similarity analysis with existing memories.',
		parameters: {
			type: 'object',
			properties: {
				memory: {
					type: 'array',
					description:
						'Updated memory entries with operations applied. Always preserve complete code blocks, command syntax, and implementation details within triple backticks.',
					items: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								description: 'Unique ID of the memory entry.',
							},
							text: {
								type: 'string',
								description:
									'Text of the memory entry including complete implementation code, command syntax, or technical details when present. Always preserve the complete pattern within triple backticks.',
							},
							event: {
								type: 'string',
								enum: ['ADD', 'UPDATE', 'DELETE', 'NONE'],
								description: 'Operation applied to the entry.',
							},
							tags: {
								type: 'array',
								items: { type: 'string' },
								description:
									"Keywords derived from the text (lowercase, singular nouns). Include technology-specific tags (e.g., 'react', 'python', 'docker').",
							},
							old_memory: {
								type: 'string',
								description:
									'Previous text, included only for UPDATE events. Ensure code patterns are properly preserved in the updated text.',
							},
							code_pattern: {
								type: 'string',
								description:
									'Optional. The extracted code pattern or command syntax if present, exactly as it appeared in the original content.',
							},
							confidence: {
								type: 'number',
								description: 'Confidence score for the operation decision (0.0 to 1.0).',
							},
						},
						required: ['id', 'text', 'event', 'tags'],
						additionalProperties: false,
					},
				},
			},
			required: ['memory'],
			additionalProperties: false,
		},
	},
};

/**
 * Interface for memory operation arguments
 */
export interface MemoryOperationArgs {
	extractedFacts: string[];
	existingMemories?: {
		id: string;
		text: string;
		metadata?: Record<string, any>;
	}[];
	context?: {
		sessionId?: string;
		userId?: string;
		projectId?: string;
		conversationTopic?: string;
		recentMessages?: string[];
		sessionMetadata?: Record<string, any>;
	};
	memoryMetadata?: Record<string, any>;
	options?: {
		similarityThreshold?: number;
		maxSimilarResults?: number;
		enableBatchProcessing?: boolean;
		useLLMDecisions?: boolean; // Enable LLM decision making
		confidenceThreshold?: number; // Minimum confidence for operations
		enableDeleteOperations?: boolean; // Enable DELETE operations
	};
}

/**
 * Interface for memory action result following UPDATE_FACT_TOOL_MEMORY pattern
 */
export interface MemoryAction {
	id: number;
	text: string;
	event: 'ADD' | 'UPDATE' | 'DELETE' | 'NONE';
	tags: string[];
	old_memory?: string;
	code_pattern?: string;
	confidence: number; // Confidence score
}

/**
 * Interface for memory operation result
 */
export interface MemoryOperationResult {
	success: boolean;
	totalFacts: number;
	processedFacts: number;
	skippedFacts: number;
	memory: MemoryAction[];
	statistics: {
		addOperations: number;
		updateOperations: number;
		deleteOperations: number;
		noneOperations: number;
		totalSimilarMemories: number;
		averageConfidence: number;
		llmDecisionsUsed: number; // Count of LLM-assisted decisions
		fallbackDecisionsUsed: number; // Count of fallback decisions
	};
	timestamp: string;
	processingTime: number;
	error?: string;
}

/**
 * Default configuration options
 */
const DEFAULT_OPTIONS = {
	similarityThreshold: 0.7,
	maxSimilarResults: 5,
	enableBatchProcessing: true,
	useLLMDecisions: true, // Enable LLM decisions by default
	confidenceThreshold: 0.4, // Lowered to allow fallback operations to proceed
	enableDeleteOperations: true, // Enable DELETE operations
} as const;

/**
 * Prompts for LLM decision making
 */
const MEMORY_OPERATION_PROMPTS = {
	SYSTEM_PROMPT: `You analyze programming knowledge facts and decide ADD, UPDATE, DELETE, or NONE using similarity with existing memories and context.

Process only significant technical content (concepts, code details, patterns, implementations). Skip personal or trivial content.

Consider:
1) Technical relevance and value
2) Semantic similarity/overlap
3) Recency and contextual relevance
4) Quality and completeness
5) Conversation context and needs
6) Concrete code/pattern details

Rules:
- ADD: New, unique technical knowledge
- UPDATE: Improves/corrects existing technical knowledge
- DELETE: Outdated/incorrect/contradictory information
- NONE: Duplicate, already covered, or non-significant

Always preserve full code blocks/commands/patterns exactly as given.`,

	DECISION_PROMPT: `Analyze the knowledge fact and choose ADD, UPDATE, DELETE, or NONE.

Steps:
1) Compare with similar memories (semantic similarity, not keywords).
2) If none are similar (below threshold) -> ADD.
3) If more correct/complete than a similar memory -> UPDATE (include targetMemoryId).
4) If redundant/already present -> NONE.
5) If contradicts an existing memory -> DELETE (include targetMemoryId).
6) Always include a confidence score (0.0–1.0).

Examples:
- ADD
  Similar: none
  { "operation": "ADD", "confidence": 0.95, "targetMemoryId": null }

- UPDATE
  Similar: 12345 (0.91)
  { "operation": "UPDATE", "confidence": 0.90, "targetMemoryId": 12345 }

- NONE
  Similar: 67890 (0.95)
  { "operation": "NONE", "confidence": 0.98, "targetMemoryId": 67890 }

- DELETE
  Similar: 54321 (0.92)
  { "operation": "DELETE", "confidence": 0.93, "targetMemoryId": 54321 }

---
FACT: {fact}
SIMILAR: {similarMemories}
CONTEXT: {context}

Respond ONLY with:
{ "operation": "ADD|UPDATE|DELETE|NONE", "confidence": 0.0-1.0, "targetMemoryId": "id-if-updating-or-deleting-or-none" }`,
};

/**
 * Memory operation tool for intelligent memory management
 */
export const memoryOperationTool: InternalTool = {
	name: 'memory_operation',
	category: 'memory',
	internal: true,
	description:
		'Process extracted knowledge and determine memory operations (ADD, UPDATE, DELETE, NONE) using LLM-powered intelligent reasoning and similarity analysis with existing memories.',
	version: '2.0.0', // version
	parameters: {
		type: 'object',
		properties: {
			extractedFacts: {
				type: 'array',
				description:
					'Array of knowledge facts already extracted from interactions, containing technical details, code patterns, or implementation information.',
				items: {
					type: 'string',
				},
			},
			existingMemories: {
				type: 'array',
				description: 'Array of existing memory entries to compare against for similarity analysis.',
				items: {
					type: 'object',
					properties: {
						id: {
							type: 'string',
							description: 'Unique identifier of the existing memory',
						},
						text: {
							type: 'string',
							description: 'Content of the existing memory',
						},
						metadata: {
							type: 'object',
							description: 'Optional metadata for the memory',
						},
					},
					required: ['id', 'text'],
				},
			},
			context: {
				type: 'object',
				description: 'Optional context information for memory operations',
				properties: {
					sessionId: {
						type: 'string',
						description: 'Current session identifier',
					},
					userId: {
						type: 'string',
						description: 'User identifier for personalized memory',
					},
					projectId: {
						type: 'string',
						description: 'Project identifier for scoped memory',
					},
					conversationTopic: {
						type: 'string',
						description: 'Current conversation topic or theme',
					},
					recentMessages: {
						type: 'array',
						items: { type: 'string' },
						description: 'Recent conversation messages for context',
					},
					sessionMetadata: {
						type: 'object',
						description: 'Additional session metadata',
					},
				},
				additionalProperties: false,
			},
			options: {
				type: 'object',
				description: 'Configuration options for memory operations',
				properties: {
					similarityThreshold: {
						type: 'number',
						description: 'Similarity threshold for memory matching (0.0 to 1.0)',
						minimum: 0.0,
						maximum: 1.0,
					},
					maxSimilarResults: {
						type: 'number',
						description: 'Maximum number of similar memories to retrieve',
						minimum: 1,
						maximum: 20,
					},
					enableBatchProcessing: {
						type: 'boolean',
						description: 'Whether to process multiple knowledge items in batch',
					},
					useLLMDecisions: {
						type: 'boolean',
						description: 'Whether to use LLM-powered decision making',
					},
					confidenceThreshold: {
						type: 'number',
						description: 'Minimum confidence threshold for operations (0.0 to 1.0)',
						minimum: 0.0,
						maximum: 1.0,
					},
					enableDeleteOperations: {
						type: 'boolean',
						description: 'Whether to enable DELETE operations',
					},
				},
				additionalProperties: false,
			},
		},
		required: ['extractedFacts'],
	},
	handler: async (
		args: MemoryOperationArgs,
		context?: InternalToolContext
	): Promise<MemoryOperationResult> => {
		const startTime = Date.now();

		try {
			logger.info('MemoryOperation: Processing memory operation request', {
				factCount: args.extractedFacts?.length || 0,
				existingMemoryCount: args.existingMemories?.length || 0,
				hasContext: !!args.context,
				hasOptions: !!args.options,
			});

			// Phase 1: Basic parameter validation
			const validationResult = validateMemoryOperationArgs(args);
			if (!validationResult.isValid) {
				throw new Error(`Invalid arguments: ${validationResult.errors.join(', ')}`);
			}

			// Merge with default options
			const options = { ...DEFAULT_OPTIONS, ...args.options };

			logger.debug('MemoryOperation: Using configuration options', {
				similarityThreshold: options.similarityThreshold,
				maxSimilarResults: options.maxSimilarResults,
				enableBatchProcessing: options.enableBatchProcessing,
				useLLMDecisions: options.useLLMDecisions,
				confidenceThreshold: options.confidenceThreshold,
				enableDeleteOperations: options.enableDeleteOperations,
			});

			// Filter valid facts
			const validFacts = args.extractedFacts
				.filter(fact => fact && typeof fact === 'string' && fact.trim().length > 0)
				.map(fact => fact.trim());

			if (validFacts.length === 0) {
				throw new Error('No valid facts found after filtering');
			}

			// Phase 2: Get available services
			const memoryActions: MemoryAction[] = [];
			let totalSimilarMemories = 0;
			let confidenceSum = 0;
			let llmDecisionsUsed = 0;
			let fallbackDecisionsUsed = 0;

			// Try to get services from context
			const embeddingManager = context?.services?.embeddingManager;
			const vectorStoreManager = context?.services?.vectorStoreManager;
			const llmService = context?.services?.llmService; // LLM service access

			let embedder: any = null;
			let vectorStore: any = null;

			// Initialize embedding and vector services
			if (embeddingManager && vectorStoreManager) {
				try {
					embedder = embeddingManager.getEmbedder('default');
					vectorStore = vectorStoreManager.getStore();

					if (embedder && vectorStore) {
						logger.debug('MemoryOperation: Using embedding and vector storage services');
					} else {
						logger.warn(
							'MemoryOperation: Services available but not initialized, using basic analysis'
						);
					}
				} catch (error) {
					logger.debug('MemoryOperation: Failed to access embedding/vector services', {
						error: error instanceof Error ? error.message : String(error),
					});
				}
			} else {
				logger.debug(
					'MemoryOperation: No embedding/vector services available in context, using basic analysis'
				);
			}

			// Check LLM service availability
			if (options.useLLMDecisions && llmService) {
				logger.debug('MemoryOperation: LLM service available for decision making');
			} else if (options.useLLMDecisions) {
				logger.warn(
					'MemoryOperation: LLM decisions requested but service not available, falling back to similarity-based decisions'
				);
			}

			// Process each fact individually or in batch
			for (let i = 0; i < validFacts.length; i++) {
				const fact = validFacts[i];
				const codePattern = extractCodePattern(fact || '');
				const tags = extractTechnicalTags(fact || '');

				let memoryAction: MemoryAction;
				let similarMemories: any[] = [];

				if (embedder && vectorStore) {
					try {
						// Generate embedding for the fact
						logger.debug('MemoryOperation: Generating embedding for fact', {
							factIndex: i,
							factLength: (fact || '').length,
						});

						let embedding;
						try {
							embedding = await embedder.embed(fact || '');
						} catch (embedError) {
							logger.error(
								'MemoryOperation: Failed to generate embedding, disabling embeddings globally',
								{
									error: embedError instanceof Error ? embedError.message : String(embedError),
									factIndex: i,
									provider: embedder.getConfig().type,
								}
							);

							// Immediately disable embeddings globally on first failure
							if (context?.services?.embeddingManager && embedError instanceof Error) {
								context.services.embeddingManager.handleRuntimeFailure(
									embedError,
									embedder.getConfig().type
								);
							}

							// Fallback to ADD operation since embeddings are now disabled
							memoryAction = {
								id: generateMemoryId(i),
								text: fact || '',
								event: 'ADD',
								tags,
								confidence: 0.6,
								...(codePattern && { code_pattern: codePattern }),
							};
							fallbackDecisionsUsed++;
							continue;
						}

						// Search for similar memories
						const searchResults = await vectorStore.search(embedding, options.maxSimilarResults);

						// Apply similarity threshold filtering
						similarMemories = searchResults.filter(
							(result: any) => (result.score || 0) >= options.similarityThreshold
						);

						totalSimilarMemories += similarMemories.length;

						logger.debug('MemoryOperation: Found similar memories', {
							factIndex: i,
							totalResults: searchResults.length,
							filteredResults: similarMemories.length,
							threshold: options.similarityThreshold,
						});

						// Use LLM decision making if available and enabled
						if (options.useLLMDecisions && llmService) {
							try {
								memoryAction = await llmDetermineMemoryOperation(
									fact || '',
									similarMemories,
									args.context,
									options,
									llmService,
									i,
									codePattern,
									tags
								);
								llmDecisionsUsed++;

								logger.debug('MemoryOperation: Used LLM decision making', {
									factIndex: i,
									operation: memoryAction.event,
									confidence: memoryAction.confidence,
								});
							} catch (error) {
								logger.warn(
									'MemoryOperation: LLM decision failed, falling back to similarity analysis',
									{
										factIndex: i,
										error: error instanceof Error ? error.message : String(error),
									}
								);

								// Fallback to similarity-based decision
								memoryAction = await determineMemoryOperation(
									fact || '',
									similarMemories,
									options.similarityThreshold,
									i,
									codePattern,
									tags
								);
								fallbackDecisionsUsed++;
							}
						} else {
							// Use similarity-based decision making
							memoryAction = await determineMemoryOperation(
								fact || '',
								similarMemories,
								options.similarityThreshold,
								i,
								codePattern,
								tags
							);
							fallbackDecisionsUsed++;
						}
					} catch (error) {
						logger.warn('MemoryOperation: Error during similarity analysis, falling back to ADD', {
							factIndex: i,
							error: error instanceof Error ? error.message : String(error),
						});

						// Fallback to ADD operation with higher confidence
						memoryAction = {
							id: generateMemoryId(i),
							text: fact || '',
							event: 'ADD',
							tags,
							confidence: 0.6, // Increased from 0.5 to exceed threshold
							...(codePattern && { code_pattern: codePattern }),
						};
						fallbackDecisionsUsed++;
					}
				} else {
					// No embedding/vector storage available - basic analysis
					const isNew = !args.existingMemories?.some(
						mem => calculateTextSimilarity(fact || '', mem.text) > options.similarityThreshold
					);

					memoryAction = {
						id: generateMemoryId(i),
						text: fact || '',
						event: isNew ? 'ADD' : 'NONE',
						tags,
						confidence: isNew ? 0.7 : 0.5, // Higher confidence for new memories
						...(codePattern && { code_pattern: codePattern }),
					};
					fallbackDecisionsUsed++;
				}

				// Apply confidence threshold
				if (
					memoryAction.confidence < options.confidenceThreshold &&
					memoryAction.event !== 'NONE'
				) {
					logger.debug('MemoryOperation: Operation confidence below threshold, changing to NONE', {
						factIndex: i,
						operation: memoryAction.event,
						confidence: memoryAction.confidence,
						threshold: options.confidenceThreshold,
					});

					memoryAction.event = 'NONE';
				}

				memoryActions.push(memoryAction);
				confidenceSum += memoryAction.confidence;
			}

			const processingTime = Date.now() - startTime;
			const averageConfidence = memoryActions.length > 0 ? confidenceSum / memoryActions.length : 0;

			const result: MemoryOperationResult = {
				success: true,
				totalFacts: args.extractedFacts.length,
				processedFacts: validFacts.length,
				skippedFacts: args.extractedFacts.length - validFacts.length,
				memory: memoryActions,
				statistics: {
					addOperations: memoryActions.filter(a => a.event === 'ADD').length,
					updateOperations: memoryActions.filter(a => a.event === 'UPDATE').length,
					deleteOperations: memoryActions.filter(a => a.event === 'DELETE').length,
					noneOperations: memoryActions.filter(a => a.event === 'NONE').length,
					totalSimilarMemories,
					averageConfidence,
					llmDecisionsUsed,
					fallbackDecisionsUsed,
				},
				timestamp: new Date().toISOString(),
				processingTime,
			};

			logger.info('MemoryOperation: Successfully processed memory operations', {
				totalFacts: result.totalFacts,
				processedFacts: result.processedFacts,
				memoryActions: result.memory.length,
				llmDecisionsUsed: result.statistics.llmDecisionsUsed,
				fallbackDecisionsUsed: result.statistics.fallbackDecisionsUsed,
				averageConfidence: result.statistics.averageConfidence.toFixed(2),
				processingTime: `${processingTime}ms`,
			});

			// Persist memory actions to vector store if available
			if (vectorStore && embedder) {
				try {
					await persistMemoryActions(memoryActions, vectorStore, embedder);
					logger.info('MemoryOperation: Successfully persisted memories to vector store', {
						persistedCount: memoryActions.filter(a => a.event === 'ADD' || a.event === 'UPDATE')
							.length,
					});
				} catch (error) {
					logger.warn('MemoryOperation: Failed to persist memories to vector store', {
						error: error instanceof Error ? error.message : String(error),
					});
					// Don't fail the entire operation if persistence fails
				}
			} else {
				logger.debug(
					'MemoryOperation: Vector store or embedder not available, skipping persistence'
				);
			}

			return result;
		} catch (error) {
			const processingTime = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : String(error);

			logger.error('MemoryOperation: Failed to process memory operations', {
				error: errorMessage,
				factCount: args.extractedFacts?.length || 0,
				processingTime: `${processingTime}ms`,
			});

			return {
				success: false,
				totalFacts: args.extractedFacts?.length || 0,
				processedFacts: 0,
				skippedFacts: args.extractedFacts?.length || 0,
				memory: [],
				statistics: {
					addOperations: 0,
					updateOperations: 0,
					deleteOperations: 0,
					noneOperations: 0,
					totalSimilarMemories: 0,
					averageConfidence: 0,
					llmDecisionsUsed: 0,
					fallbackDecisionsUsed: 0,
				},
				timestamp: new Date().toISOString(),
				processingTime,
				error: errorMessage,
			};
		}
	},
};

/**
 * LLM-powered memory operation determination
 */
async function llmDetermineMemoryOperation(
	fact: string,
	similarMemories: any[],
	context: MemoryOperationArgs['context'],
	options: Required<MemoryOperationArgs['options']>,
	llmService: any,
	index: number,
	codePattern?: string,
	tags: string[] = []
): Promise<MemoryAction> {
	const factId = generateMemoryId(index);

	try {
		// Prepare context for LLM
		const contextStr = formatContextForLLM(context);
		const similarMemoriesStr = formatSimilarMemoriesForLLM(similarMemories);

		// Create decision prompt
		const prompt = MEMORY_OPERATION_PROMPTS.DECISION_PROMPT.replace('{fact}', fact)
			.replace('{similarMemories}', similarMemoriesStr)
			.replace('{context}', contextStr);

		logger.debug('MemoryOperation: Requesting LLM decision', {
			factIndex: index,
			factLength: (fact || '').length,
			similarMemoriesCount: similarMemories.length,
		});

		// Get LLM response using directGenerate to bypass conversation context
		const response = await llmService.directGenerate(prompt);

		// Parse LLM response
		const decision = parseLLMDecision(response);

		// Validate and apply decision
		if (!decision || !isValidOperation(decision.operation)) {
			throw new Error(`Invalid LLM decision: ${JSON.stringify(decision)}`);
		}

		// Create memory action based on LLM decision
		const memoryAction: MemoryAction = {
			id: decision.targetMemoryId || factId,
			text: fact || '',
			event: decision.operation as 'ADD' | 'UPDATE' | 'DELETE' | 'NONE',
			tags,
			confidence: Math.max(0, Math.min(1, decision.confidence || 0.7)),

			...(codePattern && { code_pattern: codePattern }),
		};

		// Add old_memory for UPDATE operations
		if (memoryAction.event === 'UPDATE' && decision.targetMemoryId) {
			const targetMemory = similarMemories.find(
				mem => mem.id === decision.targetMemoryId || mem.payload?.id === decision.targetMemoryId
			);
			if (targetMemory) {
				memoryAction.old_memory = targetMemory.payload?.data || targetMemory.text || '';
			}
		}

		// Validate that the final ID is a valid integer
		if (
			typeof memoryAction.id !== 'number' ||
			!Number.isInteger(memoryAction.id) ||
			memoryAction.id <= 0
		) {
			logger.warn('MemoryOperation: Invalid memory ID detected, using fallback', {
				invalidId: memoryAction.id,
				factIndex: index,
				factPreview: fact.substring(0, 80),
			});
			memoryAction.id = factId; // Use the safe generated ID as fallback
		}

		logger.debug('MemoryOperation: LLM decision applied', {
			factIndex: index,
			operation: memoryAction.event,
			confidence: memoryAction.confidence,
			memoryId: memoryAction.id,
		});

		return memoryAction;
	} catch (error) {
		logger.warn('MemoryOperation: LLM decision failed', {
			factIndex: index,
			error: error instanceof Error ? error.message : String(error),
		});

		// Re-throw to trigger fallback
		throw error;
	}
}

/**
 * Format context information for LLM prompt
 */
function formatContextForLLM(context?: MemoryOperationArgs['context']): string {
	if (!context) {
		return 'No specific context provided.';
	}

	const parts: string[] = [];

	if (context.conversationTopic) {
		parts.push(`Topic: ${context.conversationTopic}`);
	}

	if (context.recentMessages && context.recentMessages.length > 0) {
		parts.push(`Recent messages: ${context.recentMessages.slice(-3).join(', ')}`);
	}

	if (context.sessionMetadata) {
		const metadata = Object.entries(context.sessionMetadata)
			.map(([key, value]) => `${key}: ${value}`)
			.join(', ');
		parts.push(`Session info: ${metadata}`);
	}

	return parts.length > 0 ? parts.join('\n') : 'General context.';
}

/**
 * Format similar memories for LLM prompt
 */
function formatSimilarMemoriesForLLM(similarMemories: any[]): string {
	if (!similarMemories || similarMemories.length === 0) {
		return 'No similar memories found.';
	}

	return similarMemories
		.slice(0, 3) // Limit to top 3 for prompt efficiency
		.map((memory, index) => {
			const score = memory.score ? ` (similarity: ${memory.score.toFixed(2)})` : '';
			const text = memory.payload?.data || memory.text || 'No content';
			const id = memory.id || memory.payload?.id || `memory-${index}`;

			return `${index + 1}. ID: ${id}${score}\n   Content: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`;
		})
		.join('\n\n');
}

/**
 * Parse LLM decision response with enhanced error handling and proper ID conversion
 */
function parseLLMDecision(response: string): any {
	try {
		if (!response || typeof response !== 'string') {
			logger.debug('MemoryOperation: Empty or invalid LLM response', {
				responseType: typeof response,
			});
			return null;
		}

		// Clean and normalize the response
		const cleanResponse = response.trim();

		// Helper function to safely convert ID to integer
		const safeConvertId = (id: any): number | null => {
			if (id === null || id === undefined) return null;
			const numId = parseInt(String(id), 10);
			return !isNaN(numId) && Number.isInteger(numId) && numId > 0 ? numId : null;
		};

		// Try to extract the first JSON object from the response
		const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			try {
				const decision = JSON.parse(jsonMatch[0]);
				if (decision && decision.operation && typeof decision.confidence === 'number') {
					// Normalize the decision object with proper ID conversion
					return {
						operation: decision.operation,
						confidence: Math.max(0, Math.min(1, decision.confidence)),
						reasoning: decision.reasoning || decision.reason || 'LLM decision',
						targetMemoryId: safeConvertId(
							decision.targetMemoryId || decision.target_id || decision.id
						),
					};
				}
			} catch (parseError) {
				logger.debug('MemoryOperation: Failed to parse JSON match', {
					jsonMatch: jsonMatch[0].substring(0, 100),
					error: parseError instanceof Error ? parseError.message : String(parseError),
				});
			}
		}

		// Fallback: try to find any substring that parses as JSON
		for (let start = 0; start < cleanResponse.length; start++) {
			for (let end = cleanResponse.length; end > start + 10; end--) {
				const substr = cleanResponse.slice(start, end);
				if (substr[0] !== '{' || substr[substr.length - 1] !== '}') continue;
				try {
					const obj = JSON.parse(substr);
					if (obj && obj.operation && typeof obj.confidence === 'number') {
						return {
							operation: obj.operation,
							confidence: Math.max(0, Math.min(1, obj.confidence)),
							reasoning: obj.reasoning || obj.reason || 'LLM decision',
							targetMemoryId: safeConvertId(obj.targetMemoryId || obj.target_id || obj.id),
						};
					}
				} catch {
					// Not valid JSON, continue
				}
			}
		}

		// Advanced fallback: try to extract decision components using regex
		const operationMatch = cleanResponse.match(/(?:operation|action)['"]?\s*:\s*['"]?(\w+)['"]?/i);
		const confidenceMatch = cleanResponse.match(/confidence['"]?\s*:\s*([0-9.]+)/i);
		const reasoningMatch = cleanResponse.match(
			/(?:reasoning|reason)['"]?\s*:\s*['"]([^'"]+)['"]?/i
		);

		if (operationMatch && confidenceMatch) {
			const operation = operationMatch[1]?.toUpperCase() || '';
			const confidence = parseFloat(confidenceMatch[1] || '0');

			if (['ADD', 'UPDATE', 'DELETE', 'NONE'].includes(operation) && !isNaN(confidence)) {
				logger.debug('MemoryOperation: Extracted decision using regex fallback', {
					operation,
					confidence,
					response: cleanResponse.substring(0, 200),
				});

				return {
					operation,
					confidence: Math.max(0, Math.min(1, confidence)),
					reasoning: reasoningMatch ? reasoningMatch[1] : 'Parsed from LLM response',
					targetMemoryId: null,
				};
			}
		}

		// Final fallback: look for operation keywords in the response
		const responseUpper = cleanResponse.toUpperCase();
		let detectedOperation = null;

		if (
			responseUpper.includes('ADD') ||
			responseUpper.includes('CREATE') ||
			responseUpper.includes('NEW')
		) {
			detectedOperation = 'ADD';
		} else if (
			responseUpper.includes('UPDATE') ||
			responseUpper.includes('MODIFY') ||
			responseUpper.includes('CHANGE')
		) {
			detectedOperation = 'UPDATE';
		} else if (responseUpper.includes('DELETE') || responseUpper.includes('REMOVE')) {
			detectedOperation = 'DELETE';
		} else if (
			responseUpper.includes('NONE') ||
			responseUpper.includes('SKIP') ||
			responseUpper.includes('IGNORE')
		) {
			detectedOperation = 'NONE';
		}

		if (detectedOperation) {
			logger.debug('MemoryOperation: Detected operation using keyword fallback', {
				operation: detectedOperation,
				response: cleanResponse.substring(0, 200),
			});

			return {
				operation: detectedOperation,
				confidence: 0.6, // Default confidence for keyword detection
				reasoning: 'Detected from LLM response keywords',
				targetMemoryId: null,
			};
		}

		// If all attempts fail, log the raw response and return null
		logger.debug('MemoryOperation: Failed to parse LLM decision using all methods', {
			response: cleanResponse.substring(0, 500),
			responseLength: cleanResponse.length,
		});

		return null;
	} catch (error) {
		logger.warn('MemoryOperation: Error parsing LLM decision', {
			error: error instanceof Error ? error.message : String(error),
			responsePreview: typeof response === 'string' ? response.substring(0, 100) : 'non-string',
		});
		return null;
	}
}

/**
 * Validate operation type
 */
function isValidOperation(operation: string): boolean {
	return ['ADD', 'UPDATE', 'DELETE', 'NONE'].includes(operation);
}

/**
 * Validation result interface
 */
interface ValidationResult {
	isValid: boolean;
	errors: string[];
}

/**
 * Validate memory operation arguments
 */
function validateMemoryOperationArgs(args: MemoryOperationArgs): ValidationResult {
	const errors: string[] = [];

	// Check required fields
	if (!args.extractedFacts) {
		errors.push('extractedFacts is required');
	} else if (!Array.isArray(args.extractedFacts)) {
		errors.push('extractedFacts must be an array');
	} else if (args.extractedFacts.length === 0) {
		errors.push('extractedFacts array cannot be empty');
	}

	// Validate existing memories if provided
	if (args.existingMemories) {
		if (!Array.isArray(args.existingMemories)) {
			errors.push('existingMemories must be an array');
		} else {
			args.existingMemories.forEach((memory, index) => {
				if (!memory.id || typeof memory.id !== 'string') {
					errors.push(`existingMemories[${index}].id must be a non-empty string`);
				}
				if (!memory.text || typeof memory.text !== 'string') {
					errors.push(`existingMemories[${index}].text must be a non-empty string`);
				}
			});
		}
	}

	// Validate context if provided
	if (args.context) {
		if (typeof args.context !== 'object') {
			errors.push('context must be an object');
		} else {
			if (args.context.sessionId && typeof args.context.sessionId !== 'string') {
				errors.push('context.sessionId must be a string');
			}
			if (args.context.userId && typeof args.context.userId !== 'string') {
				errors.push('context.userId must be a string');
			}
			if (args.context.projectId && typeof args.context.projectId !== 'string') {
				errors.push('context.projectId must be a string');
			}
		}
	}

	// Validate options if provided
	if (args.options) {
		if (typeof args.options !== 'object') {
			errors.push('options must be an object');
		} else {
			if (args.options.similarityThreshold !== undefined) {
				if (typeof args.options.similarityThreshold !== 'number') {
					errors.push('options.similarityThreshold must be a number');
				} else if (args.options.similarityThreshold < 0 || args.options.similarityThreshold > 1) {
					errors.push('options.similarityThreshold must be between 0.0 and 1.0');
				}
			}
			if (args.options.maxSimilarResults !== undefined) {
				if (typeof args.options.maxSimilarResults !== 'number') {
					errors.push('options.maxSimilarResults must be a number');
				} else if (args.options.maxSimilarResults < 1 || args.options.maxSimilarResults > 20) {
					errors.push('options.maxSimilarResults must be between 1 and 20');
				}
			}
			if (
				args.options.enableBatchProcessing !== undefined &&
				typeof args.options.enableBatchProcessing !== 'boolean'
			) {
				errors.push('options.enableBatchProcessing must be a boolean');
			}
			// Additional validation
			if (
				args.options.useLLMDecisions !== undefined &&
				typeof args.options.useLLMDecisions !== 'boolean'
			) {
				errors.push('options.useLLMDecisions must be a boolean');
			}
			if (args.options.confidenceThreshold !== undefined) {
				if (typeof args.options.confidenceThreshold !== 'number') {
					errors.push('options.confidenceThreshold must be a number');
				} else if (args.options.confidenceThreshold < 0 || args.options.confidenceThreshold > 1) {
					errors.push('options.confidenceThreshold must be between 0.0 and 1.0');
				}
			}
			if (
				args.options.enableDeleteOperations !== undefined &&
				typeof args.options.enableDeleteOperations !== 'boolean'
			) {
				errors.push('options.enableDeleteOperations must be a boolean');
			}
		}
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
}

/**
 * Extract code pattern from fact content
 */
function extractCodePattern(fact: string): string | undefined {
	// Extract code blocks (```...```)
	const codeBlockMatch = fact.match(/```[\s\S]*?```/);
	if (codeBlockMatch) {
		return codeBlockMatch[0];
	}

	// Extract inline code (`...`)
	const inlineCodeMatch = fact.match(/`[^`]+`/);
	if (inlineCodeMatch) {
		return inlineCodeMatch[0];
	}

	// Extract command patterns (starting with $ or npm/git/etc)
	const commandPatterns = [
		/\$\s+[^\n]+/,
		/(npm|yarn|pnpm)\s+[^\n]+/,
		/(git)\s+[^\n]+/,
		/(docker)\s+[^\n]+/,
		/(curl|wget)\s+[^\n]+/,
	];

	for (const pattern of commandPatterns) {
		const match = fact.match(pattern);
		if (match) {
			return match[0];
		}
	}

	return undefined;
}

/**
 * Extract technical tags from fact content
 */
function extractTechnicalTags(fact: string): string[] {
	const tags: string[] = [];

	// Programming languages
	const languages = [
		'javascript',
		'typescript',
		'python',
		'java',
		'rust',
		'go',
		'php',
		'ruby',
		'swift',
		'kotlin',
	];
	languages.forEach(lang => {
		if (fact.toLowerCase().includes(lang)) {
			tags.push(lang);
		}
	});

	// Frameworks and libraries
	const frameworks = [
		'react',
		'vue',
		'angular',
		'svelte',
		'nextjs',
		'express',
		'fastify',
		'django',
		'flask',
	];
	frameworks.forEach(framework => {
		if (fact.toLowerCase().includes(framework)) {
			tags.push(framework);
		}
	});

	// Tools and technologies
	const tools = [
		'docker',
		'kubernetes',
		'git',
		'npm',
		'yarn',
		'webpack',
		'vite',
		'eslint',
		'prettier',
	];
	tools.forEach(tool => {
		if (fact.toLowerCase().includes(tool)) {
			tags.push(tool);
		}
	});

	// Content type tags
	if (fact.includes('```')) {
		tags.push('code-block');
	}
	if (
		fact.includes('function') ||
		fact.includes('class') ||
		fact.includes('const') ||
		fact.includes('let') ||
		fact.includes('var')
	) {
		tags.push('programming');
	}
	if (
		fact.includes('/') ||
		fact.includes('\\') ||
		fact.includes('.js') ||
		fact.includes('.ts') ||
		fact.includes('.py')
	) {
		tags.push('file-path');
	}
	if (
		fact.includes('error') ||
		fact.includes('exception') ||
		fact.includes('failed') ||
		fact.includes('bug')
	) {
		tags.push('error-handling');
	}
	if (fact.includes('config') || fact.includes('setting') || fact.includes('option')) {
		tags.push('configuration');
	}
	if (
		fact.includes('api') ||
		fact.includes('endpoint') ||
		fact.includes('request') ||
		fact.includes('response')
	) {
		tags.push('api');
	}

	// Add general tag if no specific patterns found
	if (tags.length === 0) {
		tags.push('general-knowledge');
	}

	// Remove duplicates and return lowercase singular nouns
	return Array.from(new Set(tags)).map(tag => tag.toLowerCase());
}

/**
 * Generate unique memory ID (integer)
 * Uses range 1-333333 to avoid conflicts with other memory systems
 */
function generateMemoryId(index: number): number {
	// Use timestamp-based approach to avoid conflicts
	// Range: 1-333333 for knowledge memory entries
	const now = Date.now();
	const randomSuffix = Math.floor(Math.random() * 1000); // 0-999
	let vectorId = 1 + (((now % 300000) * 1000 + randomSuffix + index) % 333333);

	// Ensure it's a positive integer
	if (vectorId <= 0) {
		vectorId = Math.floor(Math.random() * 333333) + 1;
	}

	return vectorId;
}

/**
 * Determine memory operation based on similarity analysis (fallback method)
 */
async function determineMemoryOperation(
	fact: string,
	similarMemories: any[],
	threshold: number,
	index: number,
	codePattern?: string,
	tags: string[] = []
): Promise<MemoryAction> {
	const factId = generateMemoryId(index);

	// If no similar memories found, ADD the new fact
	if (similarMemories.length === 0) {
		return {
			id: factId,
			text: fact,
			event: 'ADD',
			tags,
			confidence: 0.8,
			...(codePattern && { code_pattern: codePattern }),
		};
	}

	// Find the most similar memory
	const mostSimilar = similarMemories[0];
	const similarity = mostSimilar.score || 0;

	// High similarity (>0.9) - consider as duplicate, return NONE
	if (similarity > 0.9) {
		return {
			id: factId,
			text: fact,
			event: 'NONE',
			tags,
			confidence: 0.9,
			...(codePattern && { code_pattern: codePattern }),
		};
	}

	// Medium-high similarity (0.7-0.9) - consider updating existing memory
	if (similarity > threshold && similarity <= 0.9) {
		return {
			id: factId,
			text: fact,
			event: 'UPDATE',
			tags,
			confidence: 0.75,
			old_memory: mostSimilar.payload?.data || mostSimilar.text || '',
			...(codePattern && { code_pattern: codePattern }),
		};
	}

	// Low similarity - ADD as new memory
	return {
		id: factId,
		text: fact,
		event: 'ADD',
		tags,
		confidence: 0.7,
		...(codePattern && { code_pattern: codePattern }),
	};
}

/**
 * Calculate text similarity using simple token-based approach
 * This is a fallback when embeddings are not available
 */
function calculateTextSimilarity(text1: string, text2: string): number {
	const words1 = new Set(text1.toLowerCase().split(/\s+/));
	const words2 = new Set(text2.toLowerCase().split(/\s+/));

	const intersection = new Set(Array.from(words1).filter(word => words2.has(word)));
	const union = new Set(Array.from(words1).concat(Array.from(words2)));

	return intersection.size / union.size;
}

/**
 * Persist memory actions to vector store
 */
async function persistMemoryActions(
	memoryActions: MemoryAction[],
	vectorStore: any,
	embedder: any
): Promise<void> {
	const actionsToProcess = memoryActions.filter(
		action => action.event === 'ADD' || action.event === 'UPDATE'
	);

	if (actionsToProcess.length === 0) {
		logger.debug('MemoryOperation: No actions require persistence');
		return;
	}

	logger.info('MemoryOperation: Persisting memory actions', {
		totalActions: actionsToProcess.length,
		addActions: actionsToProcess.filter(a => a.event === 'ADD').length,
		updateActions: actionsToProcess.filter(a => a.event === 'UPDATE').length,
	});

	// Process each action
	for (const action of actionsToProcess) {
		try {
			// Generate embedding for the memory text
			let embedding;
			try {
				embedding = await embedder.embed(action.text || '');
			} catch (embedError) {
				logger.error(
					'MemoryOperation: Failed to generate embedding for persistence, disabling embeddings globally',
					{
						error: embedError instanceof Error ? embedError.message : String(embedError),
						actionId: action.id,
						provider: embedder.getConfig().type,
					}
				);

				// Immediately disable embeddings globally on first failure
				// Note: We don't have context here, so we'll just log the error
				// The global disable will be handled by the calling function
				logger.error(
					'MemoryOperation: Cannot disable embeddings globally from persistMemoryActions - error logged'
				);

				// Skip this action and continue with others
				continue;
			}

			// Determine quality source for V2 payload
			let qualitySource: 'similarity' | 'llm' | 'heuristic' = 'heuristic';

			// Create V2 payload with enhanced metadata
			const payload = createKnowledgePayload(
				action.id,
				action.text || '',
				action.tags,
				action.confidence,
				action.event,
				{
					qualitySource,
					...(action.code_pattern && { code_pattern: action.code_pattern }),
					...(action.old_memory && { old_memory: action.old_memory }),
				}
			);

			if (action.event === 'ADD') {
				// Insert new memory
				await vectorStore.insert([embedding], [action.id], [payload]);
				logger.debug('MemoryOperation: Added memory to vector store', {
					id: action.id,
					textLength: (action.text || '').length,
				});
			} else if (action.event === 'UPDATE') {
				// Update existing memory
				await vectorStore.update(action.id, embedding, payload);
				logger.debug('MemoryOperation: Updated memory in vector store', {
					id: action.id,
					textLength: (action.text || '').length,
				});
			}
		} catch (error) {
			logger.error('MemoryOperation: Failed to persist memory action', {
				actionId: action.id,
				event: action.event,
				error: error instanceof Error ? error.message : String(error),
			});
			// Continue with other actions even if one fails
		}
	}
}
/**
 * Step 1: Rewrite user query into sub-queries and disambiguate ambiguous terms
 * Uses LLM to generate more targeted queries for better retrieval
 *
 * @param originalInput - The original user query to rewrite
 * @param llmService - The LLM service to use for rewriting
 * @returns An object containing the rewritten queries
 */
async function rewriteUserQuery(
	originalInput: string,
	llmService: any
): Promise<{ queries: string[] }> {
	// Add debugging to track function calls
	const callId = Math.random().toString(36).substring(7);
	console.log(`🔄 [${callId}] rewriteUserQuery called with: "${originalInput}"`);

	try {
		const rewritePrompt = `
        You are a query decomposition and disambiguation expert. Break down this question into search queries for a knowledge base while handling ambiguous terms.

        QUESTION: "${originalInput}"

		TASK: Create 2-4 concise search queries that capture the core information needs of the question. Only include disambiguation if absolutely necessary.

		GUIDELINES:
		- Focus on the main intent of the question.
		- Use natural, searchable language (4-15 words per query).
		- Only create disambiguation queries for clearly ambiguous terms.
		- Avoid over-decomposing the question into too many subqueries.
		- Prefer fewer, more precise queries over exhaustive coverage.
		- Each query should stand alone and be understandable without additional context.

		DISAMBIGUATION (Only if needed):
		- For truly ambiguous terms (homonyms, abbreviations, etc.), include 1-2 alternate queries with different meanings.
		- Do not force disambiguation where the meaning is already clear from context.

        OUTPUT FORMAT:
        Respond with ONLY the queries, one per line, using this exact format:
        Query 1: [first query]
        Query 2: [second query]
        [continue as needed...]

        Do not include any explanations, introductions, or other text. Only the queries.

        EXAMPLES:
        Question: "What profession does Nicholas Ray and Elia Kazan have in common?"
        Query 1: Nicholas Ray profession career
        Query 2: Elia Kazan profession career

        Question: "Most total goals in a premier league season?"
        Query 1: Most total goals in a premier league season by a team
        Query 2: Most total goals in a premier league season by a player

        Now decompose and disambiguate: "${originalInput}"
        `;
		const rewriteResponse = await llmService.directGenerate(rewritePrompt);

		// Parse the response to extract individual queries
		const queries = rewriteResponse
			.split('\n')
			.map((line: string) => line.trim())
			.filter((line: string) => line.length > 0)
			.map((line: string) => {
				// Extract query content after "Query X:" prefix
				const match = line.match(/^Query\s*\d+:\s*(.+)$/i);
				return match && match[1] ? match[1].trim() : null;
			})
			.filter((query: string | null) => query !== null && query.length >= 3)
			.filter(
				(query: string | null, index: number, array: (string | null)[]) =>
					array.indexOf(query) === index
			); // Remove duplicates

		console.log(`🔄 [${callId}] Parsed queries:`, queries);
		console.log(`🔄 [${callId}] Query count: ${queries.length}`);

		// Ensure we have at least one query (fallback to original)
		if (queries.length === 0) {
			console.log(`🔄 [${callId}] No queries parsed, falling back to original input`);
			return {
				queries: [originalInput],
			};
		}

		console.log(`🔄 [${callId}] Returning ${queries.length} refined queries`);
		return {
			queries: queries,
		};
	} catch (error) {
		console.log(`🔄 [${callId}] Error in rewriteUserQuery:`, error);
		logger.warn('MemorySearch: Query rewriting failed', {
			originalInput: originalInput.substring(0, 100),
			error: error instanceof Error ? error.message : String(error),
		});
		return {
			queries: [originalInput],
		};
	}
}

export { parseLLMDecision, MEMORY_OPERATION_PROMPTS, extractTechnicalTags, rewriteUserQuery };
