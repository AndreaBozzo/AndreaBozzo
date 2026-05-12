package harvester

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester/schema"
)

type BlogSource struct {
	RepoRoot string
}

type blogPostSource struct {
	path        string
	sourcePath  string
	frontMatter map[string]string
	body        string
}

func (source BlogSource) Name() string {
	return "blog"
}

func (source BlogSource) OutputPath(repoRoot string) string {
	return writingOutputPath(repoRoot)
}

func (source BlogSource) Fetch(ctx context.Context) (any, error) {
	posts, err := source.loadPosts(ctx)
	if err != nil {
		return nil, err
	}

	relations, err := loadWritingCaseStudyRelations(source.RepoRoot)
	if err != nil {
		return nil, err
	}

	items := make([]schema.WritingItemV1, 0, len(posts))
	for _, post := range posts {
		item, err := writingItemFromPost(post, relations)
		if err != nil {
			return nil, err
		}
		if isDraft(post.frontMatter) {
			continue
		}
		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		left := parseWritingTime(items[i].PublishedAt)
		right := parseWritingTime(items[j].PublishedAt)
		if left.Equal(right) {
			return items[i].ID < items[j].ID
		}
		return left.After(right)
	})

	return schema.WritingIndexV1{
		SchemaVersion: schema.VersionV1,
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		Source:        "blog/content/posts",
		Items:         items,
	}, nil
}

func GenerateWritingIndex(ctx context.Context, repoRoot string) error {
	return RunSource(ctx, repoRoot, BlogSource{RepoRoot: repoRoot})
}

func (source BlogSource) loadPosts(ctx context.Context) ([]blogPostSource, error) {
	postsDir := filepath.Join(source.RepoRoot, "blog", "content", "posts")
	entries, err := os.ReadDir(postsDir)
	if err != nil {
		return nil, fmt.Errorf("read blog posts directory: %w", err)
	}

	posts := make([]blogPostSource, 0, len(entries))
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}

		path := filepath.Join(postsDir, entry.Name())
		post, err := readBlogPostSource(source.RepoRoot, path)
		if err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, nil
}

func readBlogPostSource(repoRoot, path string) (blogPostSource, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return blogPostSource{}, fmt.Errorf("read %s: %w", path, err)
	}

	frontMatter, body, err := splitFrontMatter(raw)
	if err != nil {
		return blogPostSource{}, fmt.Errorf("parse front matter for %s: %w", path, err)
	}

	sourcePath, err := filepath.Rel(repoRoot, path)
	if err != nil {
		return blogPostSource{}, fmt.Errorf("relativize %s: %w", path, err)
	}

	return blogPostSource{
		path:        path,
		sourcePath:  filepath.ToSlash(sourcePath),
		frontMatter: parseSimpleYAML(frontMatter),
		body:        body,
	}, nil
}

func splitFrontMatter(raw []byte) (string, string, error) {
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	if !scanner.Scan() {
		return "", "", fmt.Errorf("empty file")
	}
	if strings.TrimSpace(scanner.Text()) != "---" {
		return "", string(raw), fmt.Errorf("missing opening front matter delimiter")
	}

	var frontMatter strings.Builder
	offset := len(scanner.Text()) + 1
	for scanner.Scan() {
		line := scanner.Text()
		offset += len(line) + 1
		if strings.TrimSpace(line) == "---" {
			return frontMatter.String(), string(raw[offset:]), nil
		}
		frontMatter.WriteString(line)
		frontMatter.WriteByte('\n')
	}
	if err := scanner.Err(); err != nil {
		return "", "", err
	}
	return "", "", fmt.Errorf("missing closing front matter delimiter")
}

func parseSimpleYAML(content string) map[string]string {
	values := map[string]string{}
	for _, line := range strings.Split(content, "\n") {
		if strings.TrimSpace(line) == "" || strings.HasPrefix(line, " ") || strings.HasPrefix(line, "\t") {
			continue
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		values[strings.TrimSpace(key)] = strings.TrimSpace(value)
	}
	return values
}

func writingItemFromPost(post blogPostSource, relations map[string][]string) (schema.WritingItemV1, error) {
	slug, language := slugAndLanguage(post.path)
	if slug == "" || language == "" {
		return schema.WritingItemV1{}, fmt.Errorf("could not infer slug/language from %s", post.sourcePath)
	}

	publishedAt := normalizeWritingDate(post.frontMatter["date"])
	wordCount := countMarkdownWords(post.body)

	return schema.WritingItemV1{
		ID:                 slug + ":" + language,
		Slug:               slug,
		Language:           language,
		Title:              unquoteYAMLString(post.frontMatter["title"]),
		Summary:            firstNonEmpty(unquoteYAMLString(post.frontMatter["summary"]), unquoteYAMLString(post.frontMatter["description"])),
		Description:        unquoteYAMLString(post.frontMatter["description"]),
		PublishedAt:        publishedAt,
		URL:                blogPostURL(slug, language),
		SourcePath:         post.sourcePath,
		Tags:               parseYAMLInlineList(post.frontMatter["tags"]),
		Categories:         parseYAMLInlineList(post.frontMatter["categories"]),
		RelatedCaseStudies: relations[slug],
		WordCount:          wordCount,
		ReadingMinutes:     readingMinutes(wordCount),
	}, nil
}

func slugAndLanguage(path string) (string, string) {
	name := strings.TrimSuffix(filepath.Base(path), ".md")
	slug, language, ok := strings.Cut(name, ".")
	if !ok {
		return "", ""
	}
	if language != "en" && language != "it" {
		return "", ""
	}
	return slug, language
}

func blogPostURL(slug, language string) string {
	if language == "en" {
		return "./blog/en/posts/" + slug + "/"
	}
	return "./blog/posts/" + slug + "/"
}

func isDraft(frontMatter map[string]string) bool {
	return strings.EqualFold(strings.TrimSpace(frontMatter["draft"]), "true")
}

func normalizeWritingDate(value string) string {
	value = unquoteYAMLString(value)
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		parsed, err := time.Parse(layout, value)
		if err == nil {
			return parsed.UTC().Format(time.RFC3339)
		}
	}
	return value
}

func parseWritingTime(value string) time.Time {
	parsed, err := time.Parse(time.RFC3339, value)
	if err == nil {
		return parsed
	}
	return time.Time{}
}

func parseYAMLInlineList(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" || value == "[]" {
		return []string{}
	}
	if strings.HasPrefix(value, "[") && strings.HasSuffix(value, "]") {
		var values []string
		if err := json.Unmarshal([]byte(value), &values); err == nil {
			return values
		}
	}
	return []string{unquoteYAMLString(value)}
}

func unquoteYAMLString(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= 2 {
		if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
			return value[1 : len(value)-1]
		}
	}
	return value
}

var markdownNoisePattern = regexp.MustCompile("(?s)```.*?```|`[^`]*`|!\\[[^\\]]*\\]\\([^)]*\\)|\\[[^\\]]*\\]\\([^)]*\\)|<[^>]+>")

func countMarkdownWords(markdown string) int {
	cleaned := markdownNoisePattern.ReplaceAllString(markdown, " ")
	cleaned = strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '\'' {
			return r
		}
		return ' '
	}, cleaned)
	return len(strings.Fields(cleaned))
}

func readingMinutes(wordCount int) int {
	if wordCount <= 0 {
		return 0
	}
	minutes := (wordCount + 219) / 220
	if minutes < 1 {
		return 1
	}
	return minutes
}

func loadWritingCaseStudyRelations(repoRoot string) (map[string][]string, error) {
	path := filepath.Join(repoRoot, "assets", "data", "case-studies.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read case-study relations: %w", err)
	}

	var payload struct {
		Items []struct {
			Slug         string   `json:"slug"`
			RelatedPosts []string `json:"relatedPosts"`
		} `json:"items"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("decode case-study relations: %w", err)
	}

	relations := map[string][]string{}
	for _, item := range payload.Items {
		for _, postSlug := range item.RelatedPosts {
			relations[postSlug] = append(relations[postSlug], item.Slug)
		}
	}
	for postSlug := range relations {
		sort.Strings(relations[postSlug])
	}
	return relations, nil
}
