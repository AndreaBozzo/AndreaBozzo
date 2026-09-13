// The README contribution updater is independent of the website build.
package main

import (
	"context"
	"fmt"
	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester"
	"os"
)

func main() {
	if len(os.Args) != 2 || os.Args[1] != "update-contributions-readme" {
		fmt.Fprintln(os.Stderr, "Usage: go run ./cmd/harvester update-contributions-readme (from the repository root)")
		os.Exit(1)
	}
	root, err := os.Getwd()
	if err == nil {
		err = harvester.UpdateContributionsREADME(context.Background(), root, "AndreaBozzo")
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
