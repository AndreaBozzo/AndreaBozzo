.PHONY: build-site preview test check
build-site:
	npm run build:site
preview:
	npm run preview
test:
	npm run test:smoke
check: test
	go test ./...
