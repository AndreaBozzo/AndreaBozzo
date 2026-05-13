package harvester

import (
	"context"
	"fmt"
	"path/filepath"
)

type Source interface {
	Name() string
	OutputPath(repoRoot string) string
	Fetch(ctx context.Context) (any, error)
}

var allSourceNames = []string{"blog", "packages", "ci", "datasets"}

func RunSource(ctx context.Context, repoRoot string, source Source) error {
	payload, err := source.Fetch(ctx)
	if err != nil {
		return fmt.Errorf("fetch %s source: %w", source.Name(), err)
	}
	if err := writeJSONFile(source.OutputPath(repoRoot), payload); err != nil {
		return fmt.Errorf("write %s source: %w", source.Name(), err)
	}
	return nil
}

func RunNamedSource(ctx context.Context, repoRoot, name string) error {
	source, err := sourceByName(repoRoot, name)
	if err != nil {
		return err
	}
	return RunSource(ctx, repoRoot, source)
}

func RunAllSources(ctx context.Context, repoRoot string) error {
	for _, name := range allSourceNames {
		if err := RunNamedSource(ctx, repoRoot, name); err != nil {
			return err
		}
	}
	return nil
}

func sourceByName(repoRoot, name string) (Source, error) {
	switch name {
	case "blog", "writing":
		return BlogSource{RepoRoot: repoRoot}, nil
	case "packages", "package-registry":
		return PackageRegistrySource{RepoRoot: repoRoot}, nil
	case "ci", "ci-runtimes":
		return CIRuntimeSource{RepoRoot: repoRoot}, nil
	case "datasets":
		return DatasetSource{RepoRoot: repoRoot}, nil
	default:
		return nil, fmt.Errorf("unknown source %q", name)
	}
}

func writingOutputPath(repoRoot string) string {
	return filepath.Join(repoRoot, "assets", "data", "writing.json")
}

func packageRegistryOutputPath(repoRoot string) string {
	return filepath.Join(repoRoot, "assets", "data", "packages.json")
}

func ciRuntimeOutputPath(repoRoot string) string {
	return filepath.Join(repoRoot, "assets", "data", "ci-runtimes.json")
}

func datasetOutputPath(repoRoot string) string {
	return filepath.Join(repoRoot, "assets", "data", "datasets.json")
}
