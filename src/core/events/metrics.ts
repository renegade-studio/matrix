/**
 * Event-based Metrics Collection
 *
 * Collects and aggregates metrics from events for monitoring and performance analysis.
 */

import { EventEnvelope, ServiceEventMap, SessionEventMap } from './event-types.js';

export interface MetricValue {
	count: number;
	sum: number;
	min: number;
	max: number;
	avg: number;
	lastUpdated: number;
}

export interface ServiceMetrics {
	// Matrix lifecycle
	matrixUptime: number;
	serviceStartCount: number;
	serviceErrorCount: number;
	allServicesReadyCount: number;

	// Tool operations
	toolRegistrationCount: number;
	toolErrorCount: number;

	// MCP operations
	mcpConnectionCount: number;
	mcpDisconnectionCount: number;
	mcpErrorCount: number;

	// Vector store operations
	vectorStoreConnectionCount: number;
	vectorStoreDisconnectionCount: number;
	vectorStoreErrorCount: number;

	// LLM provider operations
	llmProviderRegistrationCount: number;
	llmProviderErrorCount: number;
}

export interface SessionMetrics {
	// Session lifecycle
	sessionCreatedCount: number;
	sessionActivatedCount: number;
	sessionExpiredCount: number;
	sessionDeletedCount: number;
	averageSessionDuration: MetricValue;

	// Tool execution
	toolExecutionCount: number;
	toolExecutionSuccessCount: number;
	toolExecutionFailureCount: number;
	toolExecutionDuration: MetricValue;
	toolExecutionsByType: Record<string, number>;

	// LLM interactions
	llmThinkingCount: number;
	llmResponseCount: number;
	llmResponseSuccessCount: number;
	llmResponseErrorCount: number;
	llmResponseDuration: MetricValue;
	llmResponsesByModel: Record<string, number>;

	// Memory operations
	memoryStoreCount: number;
	memoryRetrieveCount: number;
	memorySearchCount: number;
	memorySearchDuration: MetricValue;

	// Conversation operations
	conversationMessageCount: number;
	conversationClearCount: number;
	contextUpdateCount: number;
	contextTruncateCount: number;
}

export interface PerformanceMetrics {
	// Event system performance
	eventEmissionRate: MetricValue; // events per second
	eventProcessingLatency: MetricValue; // ms
	eventQueueSize: number;

	// Service performance
	serviceResponseTimes: Record<string, MetricValue>;
	errorRates: Record<string, number>;

	// Resource usage
	memoryUsage: MetricValue;
	cpuUsage: MetricValue;
}

/**
 * Metrics collector that processes events and maintains statistics
 */
export class EventMetricsCollector {
	private serviceMetrics: ServiceMetrics;
	private sessionMetrics: SessionMetrics;
	private performanceMetrics: PerformanceMetrics;
	private sessionStartTimes = new Map<string, number>();
	private processingStartTime = Date.now();

	constructor() {
		this.serviceMetrics = this.initializeServiceMetrics();
		this.sessionMetrics = this.initializeSessionMetrics();
		this.performanceMetrics = this.initializePerformanceMetrics();
	}

	/**
	 * Process a service event and update metrics
	 */
	processServiceEvent(event: EventEnvelope<ServiceEventMap[keyof ServiceEventMap]>): void {
		const now = Date.now();

		switch (event.type) {
			case 'matrix:started':
				this.processingStartTime = event.metadata.timestamp;
				break;

			case 'matrix:serviceStarted':
				this.serviceMetrics.serviceStartCount++;
				break;

			case 'matrix:serviceError':
				this.serviceMetrics.serviceErrorCount++;
				break;

			case 'matrix:allServicesReady':
				this.serviceMetrics.allServicesReadyCount++;
				break;

			case 'matrix:toolRegistered':
				this.serviceMetrics.toolRegistrationCount++;
				break;

			case 'matrix:toolError':
				this.serviceMetrics.toolErrorCount++;
				break;

			case 'matrix:mcpClientConnected':
				this.serviceMetrics.mcpConnectionCount++;
				break;

			case 'matrix:mcpClientDisconnected':
				this.serviceMetrics.mcpDisconnectionCount++;
				break;

			case 'matrix:mcpClientError':
				this.serviceMetrics.mcpErrorCount++;
				break;

			case 'matrix:vectorStoreConnected':
				this.serviceMetrics.vectorStoreConnectionCount++;
				break;

			case 'matrix:vectorStoreDisconnected':
				this.serviceMetrics.vectorStoreDisconnectionCount++;
				break;

			case 'matrix:vectorStoreError':
				this.serviceMetrics.vectorStoreErrorCount++;
				break;

			case 'matrix:llmProviderRegistered':
				this.serviceMetrics.llmProviderRegistrationCount++;
				break;

			case 'matrix:llmProviderError':
				this.serviceMetrics.llmProviderErrorCount++;
				break;
		}

		// Update matrix uptime
		this.serviceMetrics.matrixUptime = now - this.processingStartTime;
	}

	/**
	 * Process a session event and update metrics
	 */
	processSessionEvent(event: EventEnvelope<SessionEventMap[keyof SessionEventMap]>): void {
		switch (event.type) {
			case 'session:created':
				this.sessionMetrics.sessionCreatedCount++;
				if (event.metadata.sessionId) {
					this.sessionStartTimes.set(event.metadata.sessionId, event.metadata.timestamp);
				}
				break;

			case 'session:activated':
				this.sessionMetrics.sessionActivatedCount++;
				break;

			case 'session:expired':
				this.sessionMetrics.sessionExpiredCount++;
				this.updateSessionDuration(event);
				break;

			case 'session:deleted':
				this.sessionMetrics.sessionDeletedCount++;
				this.updateSessionDuration(event);
				break;

			case 'tool:executionStarted': {
				this.sessionMetrics.toolExecutionCount++;
				const toolData = event.data as any;
				if (toolData.toolType) {
					this.sessionMetrics.toolExecutionsByType[toolData.toolType] =
						(this.sessionMetrics.toolExecutionsByType[toolData.toolType] || 0) + 1;
				}
				break;
			}

			case 'tool:executionCompleted':
				this.sessionMetrics.toolExecutionSuccessCount++;
				this.updateMetricValue(
					this.sessionMetrics.toolExecutionDuration,
					(event.data as any).duration || 0
				);
				break;

			case 'tool:executionFailed':
				this.sessionMetrics.toolExecutionFailureCount++;
				this.updateMetricValue(
					this.sessionMetrics.toolExecutionDuration,
					(event.data as any).duration || 0
				);
				break;

			case 'llm:thinking':
				this.sessionMetrics.llmThinkingCount++;
				break;

			case 'llm:responseStarted': {
				this.sessionMetrics.llmResponseCount++;
				const responseData = event.data as any;
				if (responseData.model) {
					this.sessionMetrics.llmResponsesByModel[responseData.model] =
						(this.sessionMetrics.llmResponsesByModel[responseData.model] || 0) + 1;
				}
				break;
			}

			case 'llm:responseCompleted':
				this.sessionMetrics.llmResponseSuccessCount++;
				this.updateMetricValue(
					this.sessionMetrics.llmResponseDuration,
					(event.data as any).duration || 0
				);
				break;

			case 'llm:responseError':
				this.sessionMetrics.llmResponseErrorCount++;
				break;

			case 'memory:stored':
				this.sessionMetrics.memoryStoreCount++;
				break;

			case 'memory:retrieved':
				this.sessionMetrics.memoryRetrieveCount++;
				break;

			case 'memory:searched':
				this.sessionMetrics.memorySearchCount++;
				this.updateMetricValue(
					this.sessionMetrics.memorySearchDuration,
					(event.data as any).duration || 0
				);
				break;

			case 'conversation:messageAdded':
				this.sessionMetrics.conversationMessageCount++;
				break;

			case 'conversation:cleared':
				this.sessionMetrics.conversationClearCount++;
				break;

			case 'context:updated':
				this.sessionMetrics.contextUpdateCount++;
				break;

			case 'context:truncated':
				this.sessionMetrics.contextTruncateCount++;
				break;
		}
	}

	/**
	 * Get current service metrics
	 */
	getServiceMetrics(): ServiceMetrics {
		return { ...this.serviceMetrics };
	}

	/**
	 * Get current session metrics
	 */
	getSessionMetrics(): SessionMetrics {
		return { ...this.sessionMetrics };
	}

	/**
	 * Get current performance metrics
	 */
	getPerformanceMetrics(): PerformanceMetrics {
		return { ...this.performanceMetrics };
	}

	/**
	 * Get comprehensive metrics summary
	 */
	getMetricsSummary(): {
		service: ServiceMetrics;
		session: SessionMetrics;
		performance: PerformanceMetrics;
		timestamp: number;
	} {
		return {
			service: this.getServiceMetrics(),
			session: this.getSessionMetrics(),
			performance: this.getPerformanceMetrics(),
			timestamp: Date.now(),
		};
	}

	/**
	 * Reset all metrics
	 */
	reset(): void {
		this.serviceMetrics = this.initializeServiceMetrics();
		this.sessionMetrics = this.initializeSessionMetrics();
		this.performanceMetrics = this.initializePerformanceMetrics();
		this.sessionStartTimes.clear();
		this.processingStartTime = Date.now();
	}

	/**
	 * Get metrics for a specific time period
	 */
	getMetricsForPeriod(startTime: number, endTime: number): any {
		// This would be implemented with time-series data storage
		// For now, return current metrics with period info
		return {
			...this.getMetricsSummary(),
			period: { startTime, endTime, duration: endTime - startTime },
		};
	}

	private initializeServiceMetrics(): ServiceMetrics {
		return {
			matrixUptime: 0,
			serviceStartCount: 0,
			serviceErrorCount: 0,
			allServicesReadyCount: 0,
			toolRegistrationCount: 0,
			toolErrorCount: 0,
			mcpConnectionCount: 0,
			mcpDisconnectionCount: 0,
			mcpErrorCount: 0,
			vectorStoreConnectionCount: 0,
			vectorStoreDisconnectionCount: 0,
			vectorStoreErrorCount: 0,
			llmProviderRegistrationCount: 0,
			llmProviderErrorCount: 0,
		};
	}

	private initializeSessionMetrics(): SessionMetrics {
		return {
			sessionCreatedCount: 0,
			sessionActivatedCount: 0,
			sessionExpiredCount: 0,
			sessionDeletedCount: 0,
			averageSessionDuration: this.createMetricValue(),
			toolExecutionCount: 0,
			toolExecutionSuccessCount: 0,
			toolExecutionFailureCount: 0,
			toolExecutionDuration: this.createMetricValue(),
			toolExecutionsByType: {},
			llmThinkingCount: 0,
			llmResponseCount: 0,
			llmResponseSuccessCount: 0,
			llmResponseErrorCount: 0,
			llmResponseDuration: this.createMetricValue(),
			llmResponsesByModel: {},
			memoryStoreCount: 0,
			memoryRetrieveCount: 0,
			memorySearchCount: 0,
			memorySearchDuration: this.createMetricValue(),
			conversationMessageCount: 0,
			conversationClearCount: 0,
			contextUpdateCount: 0,
			contextTruncateCount: 0,
		};
	}

	private initializePerformanceMetrics(): PerformanceMetrics {
		return {
			eventEmissionRate: this.createMetricValue(),
			eventProcessingLatency: this.createMetricValue(),
			eventQueueSize: 0,
			serviceResponseTimes: {},
			errorRates: {},
			memoryUsage: this.createMetricValue(),
			cpuUsage: this.createMetricValue(),
		};
	}

	private createMetricValue(): MetricValue {
		return {
			count: 0,
			sum: 0,
			min: Number.MAX_SAFE_INTEGER,
			max: 0,
			avg: 0,
			lastUpdated: Date.now(),
		};
	}

	private updateMetricValue(metric: MetricValue, value: number): void {
		metric.count++;
		metric.sum += value;
		metric.min = Math.min(metric.min, value);
		metric.max = Math.max(metric.max, value);
		metric.avg = metric.sum / metric.count;
		metric.lastUpdated = Date.now();
	}

	private updateSessionDuration(event: EventEnvelope): void {
		if (!event.metadata.sessionId) return;

		const startTime = this.sessionStartTimes.get(event.metadata.sessionId);
		if (startTime) {
			const duration = event.metadata.timestamp - startTime;
			this.updateMetricValue(this.sessionMetrics.averageSessionDuration, duration);
			this.sessionStartTimes.delete(event.metadata.sessionId);
		}
	}
}

/**
 * Metrics exporter for external monitoring systems
 */
export class MetricsExporter {
	private metricsCollector: EventMetricsCollector;

	constructor(metricsCollector: EventMetricsCollector) {
		this.metricsCollector = metricsCollector;
	}

	/**
	 * Export metrics in Prometheus format
	 */
	exportPrometheus(): string {
		const metrics = this.metricsCollector.getMetricsSummary();
		const lines: string[] = [];

		// Service metrics
		lines.push(`# HELP matrix_uptime_seconds Total uptime of matrix instance`);
		lines.push(`# TYPE matrix_uptime_seconds gauge`);
		lines.push(`matrix_uptime_seconds ${metrics.service.matrixUptime / 1000}`);

		lines.push(`# HELP matrix_service_starts_total Total number of service starts`);
		lines.push(`# TYPE matrix_service_starts_total counter`);
		lines.push(`matrix_service_starts_total ${metrics.service.serviceStartCount}`);

		lines.push(`# HELP matrix_tool_executions_total Total number of tool executions`);
		lines.push(`# TYPE matrix_tool_executions_total counter`);
		lines.push(`matrix_tool_executions_total ${metrics.session.toolExecutionCount}`);

		lines.push(`# HELP matrix_tool_execution_duration_ms Tool execution duration in milliseconds`);
		lines.push(`# TYPE matrix_tool_execution_duration_ms histogram`);
		lines.push(
			`matrix_tool_execution_duration_ms_count ${metrics.session.toolExecutionDuration.count}`
		);
		lines.push(
			`matrix_tool_execution_duration_ms_sum ${metrics.session.toolExecutionDuration.sum}`
		);

		lines.push(`# HELP matrix_llm_responses_total Total number of LLM responses`);
		lines.push(`# TYPE matrix_llm_responses_total counter`);
		lines.push(`matrix_llm_responses_total ${metrics.session.llmResponseCount}`);

		lines.push(`# HELP matrix_memory_operations_total Total number of memory operations`);
		lines.push(`# TYPE matrix_memory_operations_total counter`);
		lines.push(
			`matrix_memory_operations_total ${metrics.session.memoryStoreCount + metrics.session.memoryRetrieveCount}`
		);

		return lines.join('\n') + '\n';
	}

	/**
	 * Export metrics in JSON format
	 */
	exportJSON(): string {
		return JSON.stringify(this.metricsCollector.getMetricsSummary(), null, 2);
	}

	/**
	 * Export metrics for specific monitoring system
	 */
	exportForSystem(system: 'datadog' | 'newrelic' | 'cloudwatch'): any {
		const metrics = this.metricsCollector.getMetricsSummary();

		switch (system) {
			case 'datadog':
				return this.formatForDatadog(metrics);
			case 'newrelic':
				return this.formatForNewRelic(metrics);
			case 'cloudwatch':
				return this.formatForCloudWatch(metrics);
			default:
				return metrics;
		}
	}

	private formatForDatadog(metrics: any): any {
		// DataDog specific format
		return {
			series: [
				{
					metric: 'matrix.uptime',
					type: 'gauge',
					points: [[Date.now() / 1000, metrics.service.matrixUptime / 1000]],
				},
				{
					metric: 'matrix.tool.executions',
					type: 'count',
					points: [[Date.now() / 1000, metrics.session.toolExecutionCount]],
				},
			],
		};
	}

	private formatForNewRelic(metrics: any): any {
		// New Relic specific format
		return {
			metrics: [
				{
					name: 'matrix.uptime',
					type: 'gauge',
					value: metrics.service.matrixUptime / 1000,
					timestamp: Date.now(),
				},
			],
		};
	}

	private formatForCloudWatch(metrics: any): any {
		// CloudWatch specific format
		return {
			MetricData: [
				{
					MetricName: 'MatrixUptime',
					Value: metrics.service.matrixUptime / 1000,
					Unit: 'Seconds',
					Timestamp: new Date(),
				},
			],
		};
	}
}
