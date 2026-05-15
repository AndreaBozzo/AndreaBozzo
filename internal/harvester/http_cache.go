package harvester

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const defaultHarvesterCacheTTL = 24 * time.Hour

type httpCache struct {
	repoRoot string
	ttl      time.Duration
	disabled bool
}

func newHTTPCache(repoRoot string) httpCache {
	ttl := defaultHarvesterCacheTTL
	if raw := strings.TrimSpace(os.Getenv("HARVESTER_CACHE_TTL")); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil {
			ttl = parsed
		}
	}

	disabled := false
	if raw := strings.TrimSpace(os.Getenv("HARVESTER_DISABLE_CACHE")); raw != "" {
		raw = strings.ToLower(raw)
		disabled = raw == "1" || raw == "true" || raw == "yes"
	}

	return httpCache{repoRoot: repoRoot, ttl: ttl, disabled: disabled}
}

func (cache httpCache) get(namespace, key string, fetch func() ([]byte, error)) ([]byte, error) {
	if cache.disabled || strings.TrimSpace(cache.repoRoot) == "" {
		return fetch()
	}

	path := cache.filePath(namespace, key)
	if body, ok, err := cache.read(path); err != nil {
		return nil, err
	} else if ok {
		return body, nil
	}

	body, err := fetch()
	if err != nil {
		return nil, err
	}
	if err := cache.write(path, body); err != nil {
		return nil, err
	}
	return body, nil
}

func (cache httpCache) filePath(namespace, key string) string {
	digest := sha256.Sum256([]byte(key))
	name := hex.EncodeToString(digest[:]) + ".json"
	return filepath.Join(cache.repoRoot, ".harvester-cache", namespace, name)
}

func (cache httpCache) read(path string) ([]byte, bool, error) {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("stat cache file %s: %w", path, err)
	}
	if cache.ttl > 0 && time.Since(info.ModTime()) > cache.ttl {
		return nil, false, nil
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return nil, false, fmt.Errorf("read cache file %s: %w", path, err)
	}
	return body, true, nil
}

func (cache httpCache) write(path string, body []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create cache directory for %s: %w", path, err)
	}
	if err := os.WriteFile(path, body, 0o644); err != nil {
		return fmt.Errorf("write cache file %s: %w", path, err)
	}
	return nil
}
