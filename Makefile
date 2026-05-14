SHELL := /usr/bin/env bash

RUST_MANIFEST := rust/site_engine/Cargo.toml
HUGO_CONFIG := hugo.toml,hugo.github.toml
GO_PACKAGES := $(shell go list ./... | grep -v '/node_modules/')

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show available targets.
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_.-]+:.*##/ {printf "  %-24s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: install
install: ## Install Node dependencies.
	npm install

.PHONY: build
build: build-site ## Build the full local static site.

.PHONY: build-assets
build-assets: ## Build root CSS, JS, and WASM assets.
	npm run build:assets

.PHONY: build-css
build-css: ## Bundle root CSS.
	npm run build:css

.PHONY: build-js
build-js: ## Bundle root JavaScript.
	npm run build:js

.PHONY: build-wasm
build-wasm: ## Build the Rust/WASM workbench engine.
	npm run build:wasm

.PHONY: build-blog
build-blog: ## Build the Hugo blog with the GitHub Pages config.
	cd blog && hugo --minify -F --config $(HUGO_CONFIG)

.PHONY: build-site
build-site: ## Build the full GitHub Pages artifact under _site/.
	npm run build:site

.PHONY: generate
generate: generate-svg generate-og generate-case-studies generate-contributions generate-writing generate-packages generate-ci generate-contracts ## Regenerate static source-driven artifacts.

.PHONY: generate-svg
generate-svg: ## Regenerate case-study SVG assets.
	npm run generate:svg

.PHONY: generate-og
generate-og: ## Regenerate Open Graph images.
	npm run generate:og

.PHONY: generate-case-studies
generate-case-studies: ## Regenerate work/* case-study pages.
	npm run generate:case-studies

.PHONY: generate-contributions
generate-contributions: ## Regenerate homepage contribution data.
	npm run generate:contributions

.PHONY: generate-writing
generate-writing: ## Regenerate the schema-versioned writing index.
	npm run generate:writing

.PHONY: generate-packages
generate-packages: ## Regenerate schema-versioned package registry metadata.
	npm run generate:packages

.PHONY: generate-ci
generate-ci: ## Regenerate schema-versioned CI runtime metadata.
	npm run generate:ci

.PHONY: generate-contracts
generate-contracts: ## Regenerate schema and TypeScript contract artifacts.
	npm run generate:contracts

.PHONY: harvester-artifacts
harvester-artifacts: ## Generate combined harvester static artifacts.
	npm run harvester:artifacts

.PHONY: lint
lint: lint-js lint-svg lint-go lint-rust lint-json lint-contracts lint-whitespace ## Run all lints.

.PHONY: lint-js
lint-js: ## Lint JavaScript.
	npm run lint:js

.PHONY: lint-svg
lint-svg: ## Validate generated SVG assets.
	npm run lint:svg

.PHONY: lint-go
lint-go: ## Vet Go packages.
	go vet $(GO_PACKAGES)

.PHONY: lint-rust
lint-rust: ## Run Rust clippy with warnings denied.
	cargo clippy --manifest-path $(RUST_MANIFEST) --all-targets -- -D warnings

.PHONY: lint-json
lint-json: ## Validate checked-in JSON data files.
	jq empty assets/data/case-studies.json assets/data/papers.json assets/data/contributions.json assets/data/writing.json assets/data/package-sources.json assets/data/packages.json assets/data/ci-runtimes.json package.json

.PHONY: lint-contracts
lint-contracts: ## Validate schema-versioned JSON against committed schemas.
	npm run validate:data

.PHONY: validate-localization
validate-localization: ## Validate reciprocal hreflang links in the assembled site.
	npm run validate:localization

.PHONY: lint-whitespace
lint-whitespace: ## Check patch whitespace.
	git diff --check

.PHONY: test
test: test-go test-rust ## Run all tests.

.PHONY: test-go
test-go: ## Run Go tests.
	go test $(GO_PACKAGES)

.PHONY: test-rust
test-rust: ## Run Rust tests.
	cargo test --manifest-path $(RUST_MANIFEST)

.PHONY: fmt
fmt: fmt-go fmt-rust ## Format Go and Rust sources.

.PHONY: fmt-go
fmt-go: ## Format Go sources.
	gofmt -w $$(find . -path './node_modules' -prune -o -path './blog/themes/PaperMod' -prune -o -name '*.go' -print)

.PHONY: fmt-rust
fmt-rust: ## Format Rust sources.
	cargo fmt --manifest-path $(RUST_MANIFEST)

.PHONY: fmt-check
fmt-check: fmt-check-go fmt-check-rust ## Check Go and Rust formatting.

.PHONY: fmt-check-go
fmt-check-go: ## Check Go formatting.
	@test -z "$$(gofmt -l $$(find . -path './node_modules' -prune -o -path './blog/themes/PaperMod' -prune -o -name '*.go' -print))"

.PHONY: fmt-check-rust
fmt-check-rust: ## Check Rust formatting.
	cargo fmt --manifest-path $(RUST_MANIFEST) -- --check

.PHONY: check
check: fmt-check lint test ## Run formatting checks, lints, and tests.
