#!/usr/bin/env node
import { env } from '@core/env.js';
import { Command } from 'commander';
import pkg from '../../package.json' with { type: 'json' };
import { existsSync } from 'fs';
import { DEFAULT_CONFIG_PATH, logger, MemAgent } from '@core/index.js';
import { resolveConfigPath } from '@core/utils/path.js';
import { handleCliOptionsError, validateCliOptions } from './cli/utils/options.js';
import { loadAgentConfig } from '../core/brain/memAgent/loader.js';
import { startInteractiveCli, startHeadlessCli, startMcpMode } from './cli/cli.js';
import { ApiServer } from './api/server.js';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Helper function to resolve .env file path
function resolveEnvPath(): string {
	// Try current working directory first
	if (existsSync('.env')) {
		return '.env';
	}

	// Try relative to project root (where package.json is located)
	const currentFileUrl = import.meta.url;
	const currentFilePath = fileURLToPath(currentFileUrl);
	const projectRoot = path.resolve(path.dirname(currentFilePath), '../..');
	const envPath = path.resolve(projectRoot, '.env');

	return envPath;
}

// ===== EARLY MCP MODE DETECTION AND LOG REDIRECTION =====
// Following Saiki's best practices to prevent stdio interference
// This must happen BEFORE any logging operations
const detectAndRedirectMcpLogs = () => {
	const args = process.argv;
	const isMcpMode = args.includes('--mode') && args[args.indexOf('--mode') + 1] === 'mcp';

	if (isMcpMode) {
		// Redirect logs immediately to prevent stdout contamination
		const logFile = process.env.MATRIX_MCP_LOG_FILE || path.join(os.tmpdir(), 'matrix-mcp.log');
		logger.redirectToFile(logFile);

		// Use stderr for critical startup messages only
		process.stderr.write(`[MATRIX-MCP] Log redirection activated: ${logFile}\n`);
	}
};

// Apply early redirection before any other operations
detectAndRedirectMcpLogs();

const program = new Command();

program
	.name('matrix')
	.description('Agent that can help to remember your vibe coding agent knowledge and reinforce it')
	.version(pkg.version, '-v, --version', 'output the current version')
	.argument(
		'[prompt...]',
		'Natural-language prompt to run once. If not passed, matrix will start in interactive mode'
	)
	.option('--no-verbose', 'Disable verbose output')
	.option('-a, --agent <path>', 'Path to agent config file', DEFAULT_CONFIG_PATH)
	.option('-s, --strict', 'Require all MCP server connections to succeed')
	.option('--new-session [sessionId]', 'Start with a new session (optionally specify session ID)')
	.option('--mode <mode>', 'The application mode for matrix memory agent - cli | mcp | api', 'cli')
	.option('--port <port>', 'Port for API server (only used with --mode api)', '3000')
	.option('--host <host>', 'Host for API server (only used with --mode api)', 'localhost')
	.option(
		'--mcp-transport-type <type>',
		'MCP transport type (stdio, sse, streamable-http)',
		'stdio'
	)
	.option('--mcp-port <port>', 'Port for MCP server (only used with sse, streamable-http)', '3000');

program
	.description(
		'Matrix CLI allows you to interact with matrix memory agent.\n' +
			'Run matrix in interactive mode with `matrix` or run a one-shot prompt with `matrix <prompt>`\n\n' +
			'Available modes:\n' +
			'  - cli: Interactive command-line interface (default)\n' +
			'  - mcp: Model Context Protocol server mode\n' +
			'  - api: REST API server mode\n\n' +
			'Options:\n' +
			'  -s, --strict: Require all MCP server connections to succeed (overrides individual server connection modes)\n' +
			'  --new-session [sessionId]: Start with a new session (optionally specify session ID)\n' +
			'  --port <port>: Port for API server (default: 3000, only used with --mode api)\n' +
			'  --host <host>: Host for API server (default: localhost, only used with --mode api)'
	)
	/**
	 * Main CLI action handler for the Matrix agent.
	 *
	 * Strict Mode Behavior:
	 * When the --strict flag is used, all MCP server connectionMode properties
	 * are overridden to 'strict', requiring all server connections to succeed.
	 * This takes precedence over individual server configuration settings.
	 *
	 * If any MCP server fails to connect in strict mode, the application will
	 * exit with an error. Without strict mode, failed connections are logged
	 * as warnings but don't prevent startup.
	 *
	 * New Session Behavior:
	 * When the --new-session flag is used, a new conversation session is created
	 * and made available for the CLI interaction. The session ID parameter is optional:
	 * - --new-session: Creates a session with auto-generated UUID
	 * - --new-session mySessionId: Creates a session with the specified ID
	 *
	 * Created sessions persist for the duration of the CLI session and follow
	 * the agent's session management lifecycle and TTL settings.
	 *
	 * One-Shot Mode Behavior:
	 * When prompt arguments are provided, matrix runs in headless mode:
	 * - Executes the prompt once and exits
	 * - Works with all existing flags and options
	 * - Example: matrix "help me debug this error"
	 */
	.action(async (prompt: string[] = []) => {
		// Process prompt arguments for one-shot mode
		const headlessInput = prompt.join(' ') || undefined;

		// Parse CLI options first
		const opts = program.opts();

		// Check for .env file with proper path resolution (skip in MCP mode)
		if (opts.mode !== 'mcp') {
			const envPath = resolveEnvPath();
			if (!existsSync(envPath)) {
				const errorMsg = `No .env file found at ${envPath}, copy .env.example to .env and fill in the values`;
				logger.error(errorMsg);
				process.exit(1);
			}
		}

		// Check if at least one API key is provided or Ollama is configured
		if (
			!env.OPENAI_API_KEY &&
			!env.ANTHROPIC_API_KEY &&
			!env.OPENROUTER_API_KEY &&
			!env.OLLAMA_BASE_URL
		) {
			// Use MCP-safe error reporting
			const errorMsg =
				'No API key or Ollama configuration found, please set at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or OLLAMA_BASE_URL in your environment variables \nAvailable providers: OpenAI, Anthropic, OpenRouter, Ollama, Qwen';

			if (opts.mode === 'mcp') {
				process.stderr.write(`[MATRIX-MCP] ERROR: ${errorMsg}\n`);
			} else {
				logger.error(errorMsg);
			}
			process.exit(1);
		}

		// validate cli options
		try {
			validateCliOptions(opts);
		} catch (err) {
			handleCliOptionsError(err);
		}

		// load agent config
		let agent: MemAgent;
		try {
			// Resolve the config path based on the provided agent option
			const configPath = resolveConfigPath(opts.agent);
			logger.info(`Loading agent config from ${configPath}`);

			// Check if config file exists
			if (!existsSync(configPath)) {
				const configErrorMsg = `Config file not found at ${configPath}`;
				const helpMsg =
					opts.agent === DEFAULT_CONFIG_PATH
						? 'Please ensure the config file exists or create one based on memAgent/matrix.yml'
						: `Please ensure the specified config file exists at ${configPath}`;

				if (opts.mode === 'mcp') {
					process.stderr.write(`[MATRIX-MCP] ERROR: ${configErrorMsg}\n[MATRIX-MCP] ${helpMsg}\n`);
				} else {
					logger.error(configErrorMsg);
					logger.error(helpMsg);
				}
				process.exit(1);
			}

			const cfg = await loadAgentConfig(configPath);

			// Apply --strict flag to all MCP server configs if specified
			if (opts.strict && cfg.mcpServers) {
				logger.info('Applying strict mode to all MCP server connections');
				for (const [serverName, serverConfig] of Object.entries(cfg.mcpServers)) {
					logger.debug(`Setting connection mode to strict for server: ${serverName}`);
					serverConfig.connectionMode = 'strict';
				}
			}

			agent = new MemAgent(cfg, opts.mode);

			// Start the agent (initialize async services)
			await agent.start();

			// Handle --new-session flag
			if (opts.newSession !== undefined) {
				try {
					// Use provided session ID or generate a random one
					const sessionId =
						typeof opts.newSession === 'string' && opts.newSession ? opts.newSession : undefined; // Let agent generate random ID

					const session = await agent.createSession(sessionId);

					logger.info(`Created and loaded new session: ${session.id}`, null, 'green');
				} catch (err) {
					logger.error(
						`Failed to create new session: ${err instanceof Error ? err.message : String(err)}`
					);
					process.exit(1);
				}
			}

			// Print OpenAI embedder dimension after agent is started
			if (agent.services && agent.services.embeddingManager) {
				agent.services.embeddingManager.getEmbedder('default');
			} else {
				// Only log this in non-MCP modes to avoid stdout contamination
				if (opts.mode !== 'mcp') {
					console.log('No embeddingManager found in agent.services');
				}
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			const configPath = resolveConfigPath(opts.agent);

			if (opts.mode === 'mcp') {
				// Use stderr for MCP mode errors
				if (opts.strict) {
					process.stderr.write(
						`[MATRIX-MCP] ERROR: Failed to load agent config from ${configPath} (strict mode enabled): ${errorMessage}\n`
					);
					process.stderr.write(
						`[MATRIX-MCP] Strict mode requires all MCP server connections to succeed. Check your MCP server configurations or run without --strict flag.\n`
					);
				} else {
					process.stderr.write(
						`[MATRIX-MCP] ERROR: Failed to load agent config from ${configPath}: ${errorMessage}\n`
					);
				}
			} else {
				// Use logger for non-MCP modes
				if (opts.strict) {
					logger.error(
						`Failed to load agent config from ${configPath} (strict mode enabled):`,
						errorMessage
					);
					logger.error(
						'Strict mode requires all MCP server connections to succeed. Check your MCP server configurations or run without --strict flag to allow lenient connections.'
					);
				} else {
					logger.error(`Failed to load agent config from ${configPath}:`, errorMessage);
				}
			}
			process.exit(1);
		}

		// Handle one-shot mode if prompt arguments were provided
		if (headlessInput) {
			try {
				await startHeadlessCli(agent, headlessInput);
				process.exit(0);
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				if (opts.mode === 'mcp') {
					process.stderr.write(
						`[MATRIX-MCP] ERROR: Failed to execute headless command: ${errorMessage}\n`
					);
				} else {
					logger.error(`Failed to execute headless command: ${errorMessage}`);
				}
				process.exit(1);
			}
		}

		/**
		 * Start the API server mode
		 */
		async function startApiMode(agent: MemAgent, options: any): Promise<void> {
			const port = parseInt(options.port) || 3000;
			const host = options.host || 'localhost';
			const mcpTransportType = options.mcpTransportType || undefined; // Pass through from CLI options
			const mcpPort = options.mcpPort ? parseInt(options.mcpPort, 10) : undefined; // Pass through from CLI options

			logger.info(`Starting API server on ${host}:${port}`, null, 'green');

			const apiServer = new ApiServer(agent, {
				port,
				host,
				corsOrigins: ['http://localhost:3000', 'http://localhost:3001'], // Default CORS origins
				rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
				rateLimitMaxRequests: 100, // 100 requests per window
				...(mcpTransportType && { mcpTransportType }), // Only include if defined
				...(mcpPort !== undefined && { mcpPort }), // Only include if defined
			});

			try {
				await apiServer.start();
				logger.info(`API server is running and ready to accept requests`, null, 'green');
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				if (opts.mode === 'mcp') {
					process.stderr.write(`[MATRIX-MCP] ERROR: Failed to start API server: ${errorMsg}\n`);
				} else {
					logger.error(`Failed to start API server: ${errorMsg}`);
				}
				process.exit(1);
			}
		}

		// Enhanced shutdown hooks for all modes to ensure session persistence
		const handleExit = async () => {
			try {
				logger.info('Matrix is shutting down...');

				// For CLI mode, emit session event first
				if (opts.mode === 'cli') {
					try {
						const eventManager = agent.services?.eventManager;
						if (eventManager) {
							const sessionId = agent.getCurrentActiveSessionId() || 'default';
							eventManager.emitSessionEvent(sessionId, 'session:expired', {
								sessionId,
								timestamp: Date.now(),
							});
						}
					} catch (error) {
						logger.debug('Failed to emit session event during shutdown:', error);
					}
				}

				// Stop the agent (this will trigger session persistence)
				if (agent && agent.getIsStarted() && !agent.getIsStopped()) {
					logger.info('Stopping agent and saving sessions...');
					await agent.stop();
				}

				logger.info('Matrix shutdown completed');
			} catch (error) {
				logger.error('Error during shutdown:', error);
			} finally {
				// Force exit after a timeout to prevent hanging
				setTimeout(() => {
					logger.error('Forced exit due to shutdown timeout');
					process.exit(1);
				}, 5000);

				process.exit(0);
			}
		};

		// Register shutdown handlers for all termination signals
		process.on('SIGINT', handleExit);
		process.on('SIGTERM', handleExit);
		process.on('SIGUSR1', handleExit);
		process.on('SIGUSR2', handleExit);

		// Handle uncaught exceptions and unhandled rejections
		process.on('uncaughtException', async error => {
			logger.error('Uncaught Exception:', error);
			await handleExit();
		});

		process.on('unhandledRejection', async reason => {
			logger.error('Unhandled Rejection:', reason);
			await handleExit();
		});

		// ——— Dispatch based on --mode ———
		switch (opts.mode) {
			case 'cli':
				await startInteractiveCli(agent);
				break;
			case 'mcp':
				await startMcpMode(agent);
				break;
			case 'api':
				await startApiMode(agent, opts);
				break;
			default: {
				const errorMsg = `Unknown mode '${opts.mode}'. Use cli, mcp, or api.`;
				if (opts.mode === 'mcp') {
					process.stderr.write(`[MATRIX-MCP] ERROR: ${errorMsg}\n`);
				} else {
					logger.error(errorMsg);
				}
				process.exit(1);
			}
		}
	});

program.parseAsync(process.argv);
