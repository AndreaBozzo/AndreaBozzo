package harvester

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	recentWritingStart = "<!-- RECENT_WRITING:START -->"
	recentWritingEnd   = "<!-- RECENT_WRITING:END -->"
	blogPostBaseURL    = "https://andreabozzo.github.io/AndreaBozzo/blog/en/posts/"
)

type blogPost struct {
	Slug  string
	Title string
	Date  time.Time
}

// UpdateRecentWritingREADME rewrites the README section between the RECENT_WRITING markers
// with the newest published English posts. A post counts as published when it is not a
// draft and its date is not after now, which is what Hugo builds by default.
func UpdateRecentWritingREADME(repoRoot string, now time.Time, limit int) error {
	posts, err := loadPublishedPosts(filepath.Join(repoRoot, "blog", "content", "posts"), now)
	if err != nil {
		return err
	}
	if len(posts) == 0 {
		return fmt.Errorf("no published English posts found")
	}
	if len(posts) > limit {
		posts = posts[:limit]
	}

	readmePath := filepath.Join(repoRoot, "README.md")
	readme, err := os.ReadFile(readmePath)
	if err != nil {
		return fmt.Errorf("read README.md: %w", err)
	}
	updated, err := replaceBetweenMarkers(string(readme), recentWritingStart, recentWritingEnd, renderRecentWriting(posts))
	if err != nil {
		return err
	}
	if err := os.WriteFile(readmePath, []byte(updated), 0o644); err != nil {
		return fmt.Errorf("write README.md: %w", err)
	}
	return nil
}

// loadPublishedPosts returns published English posts, newest first.
func loadPublishedPosts(postsDir string, now time.Time) ([]blogPost, error) {
	paths, err := filepath.Glob(filepath.Join(postsDir, "*.en.md"))
	if err != nil {
		return nil, err
	}
	var posts []blogPost
	for _, path := range paths {
		fm, err := readFrontMatter(path)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", filepath.Base(path), err)
		}
		if fm["draft"] == "true" {
			continue
		}
		date, err := parsePostDate(fm["date"])
		if err != nil {
			return nil, fmt.Errorf("%s: %w", filepath.Base(path), err)
		}
		if date.After(now) {
			continue
		}
		title := fm["title"]
		if title == "" {
			return nil, fmt.Errorf("%s: missing title", filepath.Base(path))
		}
		posts = append(posts, blogPost{
			Slug:  strings.TrimSuffix(filepath.Base(path), ".en.md"),
			Title: title,
			Date:  date,
		})
	}
	sort.SliceStable(posts, func(i, j int) bool {
		if !posts[i].Date.Equal(posts[j].Date) {
			return posts[i].Date.After(posts[j].Date)
		}
		return posts[i].Slug < posts[j].Slug
	})
	return posts, nil
}

// readFrontMatter reads the top-level scalar keys of a YAML front matter block. Nested keys
// (cover.image and the like) are skipped; only title, date and draft are needed here.
func readFrontMatter(path string) (map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	values := map[string]string{}
	inBlock := false
	for scanner.Scan() {
		line := strings.TrimRight(scanner.Text(), "\r")
		if line == "---" {
			if inBlock {
				return values, nil
			}
			inBlock = true
			continue
		}
		if !inBlock {
			return nil, fmt.Errorf("no front matter")
		}
		if line == "" || line[0] == ' ' || line[0] == '\t' || line[0] == '#' {
			continue
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		values[strings.TrimSpace(key)] = unquoteYAMLScalar(strings.TrimSpace(value))
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return nil, fmt.Errorf("unterminated front matter")
}

func unquoteYAMLScalar(value string) string {
	if len(value) >= 2 && value[0] == '"' && value[len(value)-1] == '"' {
		inner := value[1 : len(value)-1]
		return strings.NewReplacer(`\"`, `"`, `\\`, `\`).Replace(inner)
	}
	if len(value) >= 2 && value[0] == '\'' && value[len(value)-1] == '\'' {
		return strings.ReplaceAll(value[1:len(value)-1], "''", "'")
	}
	return value
}

func parsePostDate(value string) (time.Time, error) {
	if date, err := time.Parse(time.RFC3339, value); err == nil {
		return date, nil
	}
	if date, err := time.Parse("2006-01-02", value); err == nil {
		return date, nil
	}
	return time.Time{}, fmt.Errorf("unrecognised date %q", value)
}

func renderRecentWriting(posts []blogPost) string {
	escaper := strings.NewReplacer(`\`, `\\`, `[`, `\[`, `]`, `\]`)
	var b strings.Builder
	for _, post := range posts {
		fmt.Fprintf(&b, "- %s: [%s](%s%s/)\n", post.Date.Format("2006-01-02"), escaper.Replace(post.Title), blogPostBaseURL, post.Slug)
	}
	return b.String()
}
