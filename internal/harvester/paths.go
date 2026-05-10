package harvester

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

func FindRepoRoot() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get working directory: %w", err)
	}

	for dir := cwd; ; dir = filepath.Dir(dir) {
		if looksLikeRepoRoot(dir) {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("could not locate repository root from %s", cwd)
		}
	}
}

func looksLikeRepoRoot(dir string) bool {
	required := []string{
		filepath.Join(dir, "README.md"),
		filepath.Join(dir, "assets", "data", "case-studies.json"),
		filepath.Join(dir, "scripts", "assemble-site.sh"),
	}

	for _, path := range required {
		if _, err := os.Stat(path); err != nil {
			return false
		}
	}

	return true
}

func writeJSONFile(path string, payload any) error {
	body, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal json for %s: %w", path, err)
	}

	body = append(body, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create directory for %s: %w", path, err)
	}

	if err := os.WriteFile(path, body, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}

	return nil
}
