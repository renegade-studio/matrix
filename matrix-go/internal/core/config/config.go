package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

// Config represents the main structure of the matrix.yml file.
type Config struct {
	MCPServers   map[string]MCPServer `yaml:"mcpServers"`
	LLM          LLM                  `yaml:"llm"`
	Embedding    Embedding            `yaml:"embedding"`
	SystemPrompt SystemPrompt         `yaml:"systemPrompt"`
}

// MCPServer represents the configuration for an MCP server.
type MCPServer struct {
	Type    string   `yaml:"type"`
	Command string   `yaml:"command"`
	Args    []string `yaml:"args"`
}

// LLM represents the configuration for the Language Model.
type LLM struct {
	Provider      string `yaml:"provider"`
	Model         string `yaml:"model"`
	APIKey        string `yaml:"apiKey"`
	MaxIterations int    `yaml:"maxIterations"`
}

// Embedding represents the configuration for the embedding model.
type Embedding struct {
	Type   string `yaml:"type"`
	Model  string `yaml:"model"`
	APIKey string `yaml:"apiKey"`
}

// SystemPrompt represents the configuration for the system prompt.
type SystemPrompt struct {
	Enabled bool   `yaml:"enabled"`
	Content string `yaml:"content"`
}

// LoadConfig loads the configuration from the given file path.
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var config Config
	err = yaml.Unmarshal(data, &config)
	if err != nil {
		return nil, err
	}

	return &config, nil
}
