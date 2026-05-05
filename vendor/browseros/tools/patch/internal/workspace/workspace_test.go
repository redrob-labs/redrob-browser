package workspace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestConfigRoundTrip(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	cfg := &Config{Version: 1, PatchesRepo: "/tmp/browseros"}
	if err := SaveConfig(cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	loaded, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if loaded.PatchesRepo != cfg.PatchesRepo {
		t.Fatalf("patches repo mismatch: got %q want %q", loaded.PatchesRepo, cfg.PatchesRepo)
	}
}

func TestRegistryDetectsLongestMatchingWorkspace(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	root := t.TempDir()
	parent := filepath.Join(root, "chromium")
	child := filepath.Join(parent, "src")
	for _, dir := range []string{parent, child} {
		if err := os.MkdirAll(filepath.Join(dir, ".git"), 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
	}
	detectedPath := filepath.Join(child, "chrome", "browser")
	if err := os.MkdirAll(detectedPath, 0o755); err != nil {
		t.Fatalf("mkdir detected path: %v", err)
	}

	reg := &Registry{Version: 1}
	if _, err := reg.Add("parent", parent); err != nil {
		t.Fatalf("add parent: %v", err)
	}
	if _, err := reg.Add("child", child); err != nil {
		t.Fatalf("add child: %v", err)
	}

	ws, err := Detect(reg, detectedPath)
	if err != nil {
		t.Fatalf("Detect: %v", err)
	}
	if ws.Name != "child" {
		t.Fatalf("expected child workspace, got %q", ws.Name)
	}
}

func TestDetectMatchesSymlinkedWorkingDirectory(t *testing.T) {
	root := t.TempDir()
	workspacePath := filepath.Join(root, "chromium-1", "src")
	if err := os.MkdirAll(filepath.Join(workspacePath, ".git"), 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(workspacePath, "chrome", "browser"), 0o755); err != nil {
		t.Fatalf("mkdir workspace child: %v", err)
	}
	linkPath := filepath.Join(root, "ch-1")
	if err := os.Symlink(workspacePath, linkPath); err != nil {
		t.Fatalf("symlink workspace: %v", err)
	}

	reg := &Registry{Version: 1}
	if _, err := reg.Add("ch1", workspacePath); err != nil {
		t.Fatalf("add workspace: %v", err)
	}

	ws, err := Detect(reg, filepath.Join(linkPath, "chrome", "browser"))
	if err != nil {
		t.Fatalf("Detect: %v", err)
	}
	if ws.Name != "ch1" {
		t.Fatalf("expected ch1 workspace, got %q", ws.Name)
	}
}

func TestRegistryAddStoresCanonicalWorkspacePath(t *testing.T) {
	root := t.TempDir()
	workspacePath := filepath.Join(root, "chromium-1", "src")
	if err := os.MkdirAll(filepath.Join(workspacePath, ".git"), 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	linkPath := filepath.Join(root, "ch-1")
	if err := os.Symlink(workspacePath, linkPath); err != nil {
		t.Fatalf("symlink workspace: %v", err)
	}

	reg := &Registry{Version: 1}
	entry, err := reg.Add("ch1", linkPath)
	if err != nil {
		t.Fatalf("add workspace: %v", err)
	}
	expectedPath := canonicalPath(workspacePath)
	if entry.Path != expectedPath {
		t.Fatalf("expected canonical path %q, got %q", expectedPath, entry.Path)
	}
}

func TestDetectErrorIncludesPathContextAndWorkspaceHint(t *testing.T) {
	root := t.TempDir()
	workspacePath := filepath.Join(root, "chromium-1", "src")
	if err := os.MkdirAll(filepath.Join(workspacePath, ".git"), 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	outsidePath := filepath.Join(root, "outside")
	if err := os.MkdirAll(outsidePath, 0o755); err != nil {
		t.Fatalf("mkdir outside: %v", err)
	}

	reg := &Registry{Version: 1}
	if _, err := reg.Add("ch1", workspacePath); err != nil {
		t.Fatalf("add workspace: %v", err)
	}

	_, err := Detect(reg, outsidePath)
	if err == nil {
		t.Fatalf("expected Detect to fail")
	}
	message := err.Error()
	for _, want := range []string{
		"cwd: " + outsidePath,
		"registered workspaces:",
		"ch1  " + canonicalPath(workspacePath),
		"example: browseros-patch diff ch1",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("expected error to contain %q, got:\n%s", want, message)
		}
	}
}
