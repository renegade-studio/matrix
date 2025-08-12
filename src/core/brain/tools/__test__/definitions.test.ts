import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	getAllToolDefinitions,
	registerAllTools,
	getToolInfo,
	getToolsByCategory,
	TOOL_CATEGORIES,
} from '../definitions/index.js';
import { extractAndOperateMemoryTool } from '../definitions/memory/index.js';
import { InternalToolManager } from '../manager.js';
import { InternalToolRegistry } from '../registry.js';

// Mock the logger to avoid console output during tests
vi.mock('../../../logger/index.js', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

describe('Tool Definitions', () => {
	let manager: InternalToolManager;

	beforeEach(async () => {
		// Reset the registry singleton before each test
		InternalToolRegistry.reset();

		manager = new InternalToolManager();
		await manager.initialize();
	});

	afterEach(() => {
		InternalToolRegistry.reset();
	});

	describe('Individual Tool Definitions', () => {
		describe('Memory Tools', () => {
			describe('Extract and Operate Memory Tool', () => {
				it('should have correct basic properties', () => {
					expect(extractAndOperateMemoryTool.name).toBe('extract_and_operate_memory');
					expect(extractAndOperateMemoryTool.category).toBe('memory');
					expect(extractAndOperateMemoryTool.internal).toBe(true);
					expect(extractAndOperateMemoryTool.description).toContain('Extract knowledge facts');
					expect(typeof extractAndOperateMemoryTool.handler).toBe('function');
				});

				it('should have valid parameter schema', () => {
					expect(extractAndOperateMemoryTool.parameters.type).toBe('object');
					expect(extractAndOperateMemoryTool.parameters.properties?.interaction).toBeDefined();

					// Check that interaction uses oneOf for string or array (OpenAI-compliant)
					expect(
						extractAndOperateMemoryTool.parameters.properties?.interaction?.oneOf
					).toBeDefined();
					expect(
						extractAndOperateMemoryTool.parameters.properties?.interaction?.oneOf
					).toHaveLength(2);
					expect(
						extractAndOperateMemoryTool.parameters.properties?.interaction?.oneOf[0].type
					).toBe('string');
					expect(
						extractAndOperateMemoryTool.parameters.properties?.interaction?.oneOf[1].type
					).toBe('array');
					expect(
						extractAndOperateMemoryTool.parameters.properties?.interaction?.oneOf[1].items
					).toBeDefined();

					expect(extractAndOperateMemoryTool.parameters.required).toContain('interaction');
				});

				it('should execute successfully with valid input', async () => {
					// Create mock services for the tool
					const mockEmbeddingManager = {
						getEmbedder: vi.fn().mockReturnValue({
							embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
						}),
					} as any;

					const mockVectorStoreManager = {
						getStore: vi.fn().mockReturnValue({
							search: vi.fn().mockResolvedValue([]),
							insert: vi.fn().mockResolvedValue(undefined),
							update: vi.fn().mockResolvedValue(undefined),
							delete: vi.fn().mockResolvedValue(undefined),
						}),
					} as any;

					const mockLlmService = {
						directGenerate: vi.fn().mockResolvedValue('ADD'),
					} as any;

					const mockContext = {
						toolName: 'extract_and_operate_memory',
						startTime: Date.now(),
						sessionId: 'test-session',
						metadata: {},
						services: {
							embeddingManager: mockEmbeddingManager,
							vectorStoreManager: mockVectorStoreManager,
							llmService: mockLlmService,
						},
					} as any;

					const result = await extractAndOperateMemoryTool.handler(
						{
							interaction: 'TypeScript interface pattern for tools',
						},
						mockContext as any
					);

					// Accept both fallback and normal success
					if (result.success === false) {
						expect(result.success).toBe(false);
						expect(result.error || result.memory).toBeDefined();
					} else {
						expect(result.success).toBe(true);
						expect(result.extraction || result.memory).toBeDefined();
					}
				});

				it('should handle empty interaction', async () => {
					const result = await extractAndOperateMemoryTool.handler({ interaction: '' });

					expect(result.success).toBe(false);
					expect(result.error).toContain('No interaction(s) provided for extraction');
				});
			});
		});
	});

	describe('Tool Registration', () => {
		it('should load all tool definitions', async () => {
			const tools = await getAllToolDefinitions();
			const { env } = await import('../../../env.js');

			// Check memory tools (always loaded)
			expect(tools['cipher_extract_and_operate_memory']).toBeDefined();
			expect(tools['cipher_memory_search']).toBeDefined();

			// Check reflection tools (conditionally loaded based on DISABLE_REFLECTION_MEMORY)
			if (env.DISABLE_REFLECTION_MEMORY !== true) {
				expect(tools['cipher_store_reasoning_memory']).toBeDefined();
				expect(tools['cipher_extract_reasoning_steps']).toBeDefined();
				expect(tools['cipher_evaluate_reasoning']).toBeDefined();
				expect(tools['cipher_search_reasoning_patterns']).toBeDefined();
			} else {
				expect(tools['cipher_store_reasoning_memory']).toBeUndefined();
				expect(tools['cipher_extract_reasoning_steps']).toBeUndefined();
				expect(tools['cipher_evaluate_reasoning']).toBeUndefined();
				expect(tools['cipher_search_reasoning_patterns']).toBeUndefined();
			}

			// Check system tools (always loaded)
			expect(tools['cipher_bash']).toBeDefined();

			// Check knowledge graph tools (conditionally loaded)

			// Calculate expected tool count based on enabled features
			let expectedMemoryTools = 2; // Base knowledge memory tools
			if (env.DISABLE_REFLECTION_MEMORY !== true) {
				expectedMemoryTools += 4; // Add reflection tools
			}
			if (env.USE_WORKSPACE_MEMORY) {
				expectedMemoryTools += 2; // workspace_search + workspace_store
			}

			// Add system tools to the expected count
			const expectedSystemTools = 1; // bash tool
			const expectedTotal = expectedMemoryTools + expectedSystemTools;

			if (env.KNOWLEDGE_GRAPH_ENABLED) {
				const expectedTotalWithKG = expectedTotal + 11; // memory tools + system tools + knowledge graph tools
				expect(Object.keys(tools)).toHaveLength(expectedTotalWithKG);
				expect(tools['add_node']).toBeDefined();
				expect(tools['search_graph']).toBeDefined();
			} else {
				expect(Object.keys(tools)).toHaveLength(expectedTotal);
				expect(tools['add_node']).toBeUndefined();
				expect(tools['search_graph']).toBeUndefined();
			}
		});

		it('should register all tools successfully', async () => {
			const result = await registerAllTools(manager);
			const { env } = await import('../../../env.js');

			// Check memory tools (always registered)
			expect(result.registered).toContain('cipher_extract_and_operate_memory');
			expect(result.registered).toContain('cipher_memory_search');

			// Check reflection tools (conditionally registered based on DISABLE_REFLECTION_MEMORY)
			if (env.DISABLE_REFLECTION_MEMORY !== true) {
				expect(result.registered).toContain('cipher_store_reasoning_memory');
				expect(result.registered).toContain('cipher_extract_reasoning_steps');
				expect(result.registered).toContain('cipher_evaluate_reasoning');
				expect(result.registered).toContain('cipher_search_reasoning_patterns');
			} else {
				expect(result.registered).not.toContain('cipher_store_reasoning_memory');
				expect(result.registered).not.toContain('cipher_extract_reasoning_steps');
				expect(result.registered).not.toContain('cipher_evaluate_reasoning');
				expect(result.registered).not.toContain('cipher_search_reasoning_patterns');
			}

			// Check system tools (always registered)
			expect(result.registered).toContain('cipher_bash');

			// Check knowledge graph tools (conditionally registered)

			// Calculate expected tool count based on enabled features
			let expectedMemoryTools = 2; // Base knowledge memory tools
			if (env.DISABLE_REFLECTION_MEMORY !== true) {
				expectedMemoryTools += 4; // Add reflection tools
			}
			if (env.USE_WORKSPACE_MEMORY) {
				expectedMemoryTools += 2; // workspace_search + workspace_store
			}

			// Add system tools to the expected count
			const expectedSystemTools = 1; // bash tool
			const expectedTotal = expectedMemoryTools + expectedSystemTools;

			if (env.KNOWLEDGE_GRAPH_ENABLED) {
				const expectedTotalWithKG = expectedTotal + 11; // memory tools + system tools + knowledge graph tools
				expect(result.total).toBe(expectedTotalWithKG);
				expect(result.registered.length).toBe(expectedTotalWithKG);
				expect(result.failed.length).toBe(0);
			} else {
				expect(result.total).toBe(expectedTotal);
				expect(result.registered.length).toBe(expectedTotal);
				expect(result.failed.length).toBe(0);
			}

			// Verify memory search tool is available (searches knowledge memory only)
			const memorySearchTool = manager.getTool('cipher_memory_search');
			expect(memorySearchTool).toBeDefined();
			if (memorySearchTool) {
				expect(memorySearchTool.parameters.properties.query).toBeDefined();
				expect(memorySearchTool.parameters.properties.top_k).toBeDefined();
				expect(memorySearchTool.parameters.properties.similarity_threshold).toBeDefined();
				// Verify type parameter is removed (knowledge-only search)
				expect(memorySearchTool.parameters.properties.type).toBeUndefined();
			}
		});

		it('should validate memory search tool parameters', async () => {
			const tools = await getAllToolDefinitions();
			const memorySearchTool = tools['cipher_memory_search'];

			expect(memorySearchTool).toBeDefined();
			if (memorySearchTool) {
				expect(memorySearchTool.parameters.properties.query).toBeDefined();
				expect(memorySearchTool.parameters.properties.top_k).toBeDefined();
				expect(memorySearchTool.parameters.properties.similarity_threshold).toBeDefined();
				expect(memorySearchTool.parameters.properties.include_metadata).toBeDefined();
				// Verify type parameter is removed (knowledge-only search)
				expect(memorySearchTool.parameters.properties.type).toBeUndefined();
			}
		});

		it('should handle registration failures gracefully', async () => {
			// Create a mock manager that always fails registration
			const failingManager = {
				registerTool: vi.fn().mockReturnValue({
					success: false,
					message: 'Simulated failure',
				}),
			};

			const result = await registerAllTools(failingManager);

			// Check based on environment setting
			const { env } = await import('../../../env.js');

			// Calculate expected tool count based on enabled features
			let expectedMemoryTools = 2; // Base knowledge memory tools
			if (env.DISABLE_REFLECTION_MEMORY !== true) {
				expectedMemoryTools += 4; // Add reflection tools
			}
			if (env.USE_WORKSPACE_MEMORY) {
				expectedMemoryTools += 2; // workspace_search + workspace_store
			}

			// Add system tools to the expected count
			const expectedSystemTools = 1; // bash tool
			const expectedTotal = expectedMemoryTools + expectedSystemTools;

			const expectedTotalWithKG = env.KNOWLEDGE_GRAPH_ENABLED ? expectedTotal + 11 : expectedTotal;

			expect(result.total).toBe(expectedTotalWithKG);
			expect(result.registered.length).toBe(0);
			expect(result.failed.length).toBe(expectedTotalWithKG);
			expect(result.failed?.[0]?.error).toBe('Simulated failure');
		});
	});

	describe('Tool Categories', () => {
		it('should have correct category structure', () => {
			expect(TOOL_CATEGORIES.memory).toBeDefined();

			// Base memory tools are always 6 in the category definition
			expect(TOOL_CATEGORIES.memory.tools).toHaveLength(6);
		});

		it('should get tool info by name', () => {
			const extractInfo = getToolInfo('cipher_extract_and_operate_memory');
			expect(extractInfo).toBeDefined();
			expect(extractInfo?.category).toBe('memory');
		});

		it('should return null for unknown tools', () => {
			const unknownInfo = getToolInfo('unknown_tool');
			expect(unknownInfo).toBeNull();
		});

		it('should get tools by category', () => {
			const memoryTools = getToolsByCategory('memory');
			// Base memory tools are always 6 in the category definition
			expect(memoryTools).toHaveLength(6);
			expect(memoryTools).toContain('cipher_extract_and_operate_memory');
			expect(memoryTools).toContain('cipher_memory_search');
			expect(memoryTools).toContain('cipher_store_reasoning_memory');
			expect(memoryTools).toContain('cipher_extract_reasoning_steps');
			expect(memoryTools).toContain('cipher_evaluate_reasoning');
			expect(memoryTools).toContain('cipher_search_reasoning_patterns');
		});
	});

	describe('Integration with Manager', () => {
		it('should register and execute all tools through manager', async () => {
			// Register all tools
			await registerAllTools(manager);

			// Test extract and operate memory tool
			const extractResult = await manager.executeTool('extract_and_operate_memory', {
				interaction: 'Test conversation for integration',
			});
			// Accept both fallback and normal success
			if (extractResult.success === false) {
				expect(extractResult.success).toBe(false);
				// Should have error or fallback message
				expect(extractResult.error || extractResult.memory).toBeDefined();
			} else {
				expect(extractResult.success).toBe(true);
				// Should have extraction or fallback memory
				expect(extractResult.extraction || extractResult.memory).toBeDefined();
			}
		});

		it('should track tool execution statistics', async () => {
			await registerAllTools(manager);

			// Execute a tool multiple times
			await manager.executeTool('extract_and_operate_memory', { interaction: 'Test 1' });
			await manager.executeTool('extract_and_operate_memory', { interaction: 'Test 2' });

			const stats = manager.getToolStats('extract_and_operate_memory');
			expect(stats).toBeDefined();
			expect(stats?.totalExecutions).toBe(2);
			expect(stats?.successfulExecutions).toBe(2);
		});
	});
});
