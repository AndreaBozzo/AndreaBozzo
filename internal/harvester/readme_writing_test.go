package harvester

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writePost(t *testing.T, dir, name, frontMatter string) {
	t.Helper()
	content := "---\n" + frontMatter + "\n---\n\nBody.\n"
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestUpdateRecentWritingREADMEPicksNewestPublished(t *testing.T) {
	root := t.TempDir()
	posts := filepath.Join(root, "blog", "content", "posts")
	if err := os.MkdirAll(posts, 0o755); err != nil {
		t.Fatal(err)
	}
	writePost(t, posts, "old-blog.en.md", "title: \"Old\"\ndate: 2026-01-01T12:00:00+01:00\ndraft: false")
	writePost(t, posts, "mid-blog.en.md", "title: \"It's [Mid]\"\ndate: 2026-03-01\ndraft: false")
	writePost(t, posts, "new-blog.en.md", "title: \"Say \\\"New\\\"\"\ndate: 2026-05-01T12:00:00+02:00\ndraft: false\ncover:\n    image: \"x.webp\"")
	writePost(t, posts, "newest-blog.en.md", "title: \"Newest\"\ndate: 2026-06-01T12:00:00+02:00\ndraft: false")
	writePost(t, posts, "draft-blog.en.md", "title: \"Draft\"\ndate: 2026-06-02T12:00:00+02:00\ndraft: true")
	writePost(t, posts, "future-blog.en.md", "title: \"Future\"\ndate: 2026-12-01T12:00:00+01:00\ndraft: false")
	writePost(t, posts, "newest-blog.it.md", "title: \"Italiano\"\ndate: 2026-06-01T12:00:00+02:00\ndraft: false")

	readme := "# Me\n\n## Recent writing\n\n" + recentWritingStart + "\n- stale\n" + recentWritingEnd + "\n\nFooter\n"
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte(readme), 0o644); err != nil {
		t.Fatal(err)
	}

	now := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	if err := UpdateRecentWritingREADME(root, now, 3); err != nil {
		t.Fatalf("UpdateRecentWritingREADME: %v", err)
	}
	got, err := os.ReadFile(filepath.Join(root, "README.md"))
	if err != nil {
		t.Fatal(err)
	}

	want := recentWritingStart + "\n" +
		"- 2026-06-01: [Newest](" + blogPostBaseURL + "newest-blog/)\n" +
		"- 2026-05-01: [Say \"New\"](" + blogPostBaseURL + "new-blog/)\n" +
		"- 2026-03-01: [It's \\[Mid\\]](" + blogPostBaseURL + "mid-blog/)\n" +
		recentWritingEnd
	if !strings.Contains(string(got), want) {
		t.Fatalf("unexpected README section:\n%s", got)
	}
	if !strings.HasSuffix(string(got), recentWritingEnd+"\n\nFooter\n") {
		t.Fatalf("text after the end marker changed:\n%s", got)
	}
}

func TestReadFrontMatterHandlesCRLF(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "crlf-blog.en.md")
	if err := os.WriteFile(path, []byte("---\r\ntitle: \"CRLF\"\r\ndraft: false\r\n---\r\nBody\r\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	fm, err := readFrontMatter(path)
	if err != nil {
		t.Fatalf("readFrontMatter: %v", err)
	}
	if fm["title"] != "CRLF" || fm["draft"] != "false" {
		t.Fatalf("unexpected front matter: %#v", fm)
	}
}
