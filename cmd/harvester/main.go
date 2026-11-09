// The README updaters are independent of the website build.
package main

import (
	"context"
	"fmt"
	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester"
	"os"
	"time"
)

const usage = "Usage: go run ./cmd/harvester <update-contributions-readme|update-writing-readme> (from the repository root)"

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(1)
	}
	root, err := os.Getwd()
	if err == nil {
		switch os.Args[1] {
		case "update-contributions-readme":
			err = harvester.UpdateContributionsREADME(context.Background(), root, "AndreaBozzo")
		case "update-writing-readme":
			err = harvester.UpdateRecentWritingREADME(root, time.Now(), 3)
		default:
			fmt.Fprintln(os.Stderr, usage)
			os.Exit(1)
		}
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
