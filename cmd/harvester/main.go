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
	case "generate-contributions-json":
		return harvester.GenerateContributionsJSON(repoRoot)
	case "generate-case-study-pages":
		return harvester.GenerateCaseStudyPages(repoRoot)
	case "generate-static-artifacts":
		return generateStaticArtifacts(repoRoot)
	case "update-contributions-readme":
		return harvester.UpdateContributionsREADME(context.Background(), repoRoot, "AndreaBozzo")
	default:
		return fmt.Errorf("unknown subcommand %q\n\n%s", args[0], usageText())
	}
}

func generateStaticArtifacts(repoRoot string) error {
	var wg sync.WaitGroup
	errCh := make(chan error, 2)

	wg.Add(2)
	go func() {
		defer wg.Done()
		errCh <- harvester.GenerateContributionsJSON(repoRoot)
	}()
	go func() {
		defer wg.Done()
		errCh <- harvester.GenerateCaseStudyPages(repoRoot)
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

func usageError() error {
	return errors.New(usageText())
}

func usageText() string {
	return "harvester is the unified Go CLI for repo data generation.\n\nUsage:\n  go run ./cmd/harvester <subcommand>\n\nSubcommands:\n  update-contributions-readme\n  generate-contributions-json\n  generate-case-study-pages\n  generate-static-artifacts\n"
}
