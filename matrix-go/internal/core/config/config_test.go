package config

import (
	"reflect"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestParseConfig(t *testing.T) {
	yamlData := `
mcpServers:
  filesystem:
    type: stdio
    command: npx
    args:
      - -y
      - '@modelcontextprotocol/server-filesystem'
      - .
llm:
  provider: openai
  model: gpt-4.1-mini
  apiKey: $OPENAI_API_KEY
  maxIterations: 50
embedding:
  type: openai
  model: text-embedding-3-small
  apiKey: $OPENAI_API_KEY
systemPrompt:
  enabled: true
  content: |
    You are an AI programming assistant.
`

	expected := &Config{
		MCPServers: map[string]MCPServer{
			"filesystem": {
				Type:    "stdio",
				Command: "npx",
				Args: []string{
					"-y",
					"@modelcontextprotocol/server-filesystem",
					".",
				},
			},
		},
		LLM: LLM{
			Provider:      "openai",
			Model:         "gpt-4.1-mini",
			APIKey:        "$OPENAI_API_KEY",
			MaxIterations: 50,
		},
		Embedding: Embedding{
			Type:   "openai",
			Model:  "text-embedding-3-small",
			APIKey: "$OPENAI_API_KEY",
		},
		SystemPrompt: SystemPrompt{
			Enabled: true,
			Content: "You are an AI programming assistant.\n",
		},
	}

	var actual Config
	err := yaml.Unmarshal([]byte(yamlData), &actual)
	if err != nil {
		t.Fatalf("Failed to unmarshal YAML: %v", err)
	}

	if !reflect.DeepEqual(&actual, expected) {
		t.Errorf("Parsed config does not match expected config.\nGot: %+v\nWant: %+v", actual, *expected)
	}
}
