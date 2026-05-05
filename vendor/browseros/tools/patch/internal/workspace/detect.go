package workspace

import (
	"fmt"
	"path/filepath"
	"slices"
	"strings"
)

func Detect(reg *Registry, cwd string) (Entry, error) {
	if len(reg.Workspaces) == 0 {
		return Entry{}, fmt.Errorf("no workspaces registered yet")
	}
	abs, err := filepath.Abs(cwd)
	if err != nil {
		return Entry{}, err
	}
	clean := filepath.Clean(abs)
	realClean := canonicalPath(clean)
	var best Entry
	bestLen := -1
	for _, ws := range reg.Workspaces {
		base := filepath.Clean(ws.Path)
		realBase := canonicalPath(base)
		if containsPath(clean, base) || containsPath(realClean, realBase) {
			if len(realBase) > bestLen {
				best = ws
				bestLen = len(realBase)
			}
		}
	}
	if bestLen == -1 {
		return Entry{}, detectError(clean, realClean, reg.Workspaces)
	}
	return best, nil
}

func Resolve(reg *Registry, name string, cwd string, src string) (Entry, error) {
	if src != "" {
		path, err := NormalizeWorkspacePath(src)
		if err != nil {
			return Entry{}, err
		}
		return Entry{Name: filepath.Base(path), Path: path}, nil
	}
	if name != "" {
		return reg.Get(name)
	}
	return Detect(reg, cwd)
}

func canonicalPath(path string) string {
	realPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return filepath.Clean(path)
	}
	return filepath.Clean(realPath)
}

func containsPath(path string, base string) bool {
	return path == base || strings.HasPrefix(path, base+string(filepath.Separator))
}

func detectError(cwd string, resolvedCWD string, workspaces []Entry) error {
	var builder strings.Builder
	builder.WriteString(`not inside a registered workspace; run "browseros-patch list" to inspect workspaces or pass one by name`)
	builder.WriteString("\n")
	builder.WriteString("cwd: ")
	builder.WriteString(cwd)
	if resolvedCWD != cwd {
		builder.WriteString("\nresolved cwd: ")
		builder.WriteString(resolvedCWD)
	}
	if len(workspaces) > 0 {
		builder.WriteString("\nregistered workspaces:")
		sorted := append([]Entry(nil), workspaces...)
		slices.SortFunc(sorted, func(a, b Entry) int {
			return strings.Compare(a.Name, b.Name)
		})
		for _, ws := range sorted {
			builder.WriteString("\n  ")
			builder.WriteString(ws.Name)
			builder.WriteString("  ")
			builder.WriteString(ws.Path)
		}
		builder.WriteString("\nexample: browseros-patch diff ")
		builder.WriteString(sorted[0].Name)
	}
	return fmt.Errorf("%s", builder.String())
}
