package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"

	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string) error {
	repoRoot, err := harvester.FindRepoRoot()
	if err != nil {
		return err
	}

	if len(args) == 0 {
		return usageError()
	}

	switch args[0] {
	case "help", "--help", "-h":
		return usageError()
	case "ingest":
		return ingestSources(context.Background(), repoRoot, args[1:])
	case "generate-contributions-json":
		return harvester.GenerateContributionsJSON(repoRoot)
	case "generate-writing-index":
		return harvester.GenerateWritingIndex(context.Background(), repoRoot)
	case "generate-package-registry-index":
		return harvester.GeneratePackageRegistryIndex(context.Background(), repoRoot)
	case "generate-ci-runtime-index":
		return harvester.GenerateCIRuntimeIndex(context.Background(), repoRoot)
	case "generate-dataset-index":
		return harvester.GenerateDatasetIndex(context.Background(), repoRoot)
	case "generate-repository-metadata-index":
		return harvester.GenerateRepositoryMetadataIndex(context.Background(), repoRoot)
	case "generate-contract-artifacts":
		return harvester.GenerateContractArtifacts(repoRoot)
	case "generate-case-study-pages":
		return harvester.GenerateCaseStudyPages(repoRoot)
	case "generate-static-artifacts":
		return generateStaticArtifacts(repoRoot)
	case "update-contributions-readme":
		return harvester.UpdateContributionsREADME(context.Background(), repoRoot, "AndreaBozzo")
	case "validate-localization":
		siteRoot := repoRoot + "/_site"
		if len(args) >= 2 && args[1] != "" {
			siteRoot = args[1]
		}
		return harvester.ValidateLocalization(siteRoot)
	default:
		return fmt.Errorf("unknown subcommand %q\n\n%s", args[0], usageText())
	}
}

func generateStaticArtifacts(repoRoot string) error {
	var wg sync.WaitGroup
	errCh := make(chan error, 3)

	wg.Add(3)
	go func() {
		defer wg.Done()
		errCh <- harvester.GenerateContributionsJSON(repoRoot)
	}()
	go func() {
		defer wg.Done()
		errCh <- harvester.GenerateCaseStudyPages(repoRoot)
	}()
	go func() {
		defer wg.Done()
		errCh <- harvester.GenerateRootSEOArtifacts(repoRoot)
	}()

	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			return err
		}
	}

	return nil
}

func ingestSources(ctx context.Context, repoRoot string, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("ingest requires --source <name> or --all\n\n%s", usageText())
	}

	if len(args) == 1 && args[0] == "--all" {
		return harvester.RunAllSources(ctx, repoRoot)
	}

	if len(args) != 2 || args[0] != "--source" {
		return fmt.Errorf("invalid ingest arguments %q\n\n%s", args, usageText())
	}

	return harvester.RunNamedSource(ctx, repoRoot, args[1])
}

func usageError() error {
	return errors.New(usageText())
}

func usageText() string {
	return "harvester is the unified Go CLI for repo data generation.\n\nUsage:\n  go run ./cmd/harvester <subcommand>\n\nSubcommands:\n  ingest --source blog\n  ingest --source packages\n  ingest --source ci\n  ingest --source datasets\n  ingest --source repo-metadata\n  ingest --all\n  update-contributions-readme\n  generate-contributions-json\n  generate-writing-index\n  generate-package-registry-index\n  generate-ci-runtime-index\n  generate-dataset-index\n  generate-repository-metadata-index\n  generate-contract-artifacts\n  generate-case-study-pages\n  generate-static-artifacts\n  validate-localization [siteRoot]\n"
}
