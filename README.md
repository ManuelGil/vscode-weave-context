# Weave Context

[![GitHub package.json version](https://img.shields.io/github/package-json/v/ManuelGil/vscode-weave-context?style=for-the-badge&logo=github)](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-weave-context)
[![GitHub Repo Stars](https://img.shields.io/github/stars/ManuelGil/vscode-weave-context?style=for-the-badge&logo=github)](https://github.com/ManuelGil/vscode-weave-context)
[![GitHub License](https://img.shields.io/github/license/ManuelGil/vscode-weave-context?style=for-the-badge&logo=github)](https://github.com/ManuelGil/vscode-weave-context/blob/main/LICENSE)

> Navigate repository knowledge like code.

![Weave Context overview](https://raw.githubusercontent.com/ManuelGil/vscode-weave-context/main/assets/images/repository-overview.png)

Weave Context is a native VS Code authoring experience for repository-based knowledge.

It is a developer-first, repository-native tool for creating, navigating, and maintaining engineering knowledge alongside source code.

Instead of treating knowledge documents as isolated files, Weave Context treats explicit Markdown references as navigable editor symbols.

That means you can:

- Go to Definition
- Find References
- Rename Symbol
- Autocomplete wikilinks

across connected knowledge documents.

Your knowledge remains in plain Markdown files.

Your repository knowledge becomes navigable.

Knowledge documents can live beside source code, configuration, and project history. Weave Context gives that repository-based knowledge the same deterministic authoring experience developers expect from code.

## Repository-Based Knowledge for Developers

Software repositories evolve quickly.

The knowledge around them often does not.

Source code records how a system works. Repository documentation, maintained as Documentation-as-Code, records why it works that way and how it evolves.

Architecture decisions, implementation documentation, debugging trails, trade-offs, and technical reasoning become scattered across:

- repository documentation
- pull requests
- comments
- memory

The repository becomes the durable place where this knowledge should be written, linked, and maintained. The problem is finding and evolving it without leaving the editor:

> Where did I see this?

Weave Context keeps repository-native knowledge navigable and maintainable directly inside VS Code.

## What Makes It Different

Repository knowledge needs more than readable files. It needs:

```text
navigation and maintenance
```

Weave Context makes explicit Markdown references behave like editor primitives.

This enables:

- Go to Definition for knowledge documents
- Find References across Markdown
- Rename-safe link maintenance
- Documentation continuity as knowledge documents evolve
- Deterministic navigation
- Filesystem-backed identity

## Mental Model

Weave Context is built around a small set of principles.

### Knowledge lives in ordinary Markdown files

Files are the source of identity.

Each knowledge document is identified by its repository path. That path is its canonical identity.

Not by:

- hidden IDs
- database records
- proprietary identifiers

### Wikilinks create relationships

Relationships are created explicitly:

```md
[[token-expiration]]
```

No relationship exists unless a reference exists.

### Relationships come from references

Weave Context does not infer connections.

It does not use:

- embeddings
- AI inference
- similarity matching
- shared tags
- co-occurrence analysis

Relationships come only from explicit references.

### Aliases help resolution

Aliases provide alternate entry points for navigation.

They do not create new knowledge documents.

They do not create new relationships.

They simply help multiple names resolve to the same destination.

### Navigation and maintenance share the same model

The same identity model powers:

- navigation
- references
- rename
- completion
- visualization

There are no parallel identity or relationship systems.

Everything builds on the same reference model.

## Filesystem-Backed Identity

Weave Context uses the filesystem as the canonical identity layer.

This makes navigation:

- deterministic
- portable
- inspectable
- repository-friendly

No hidden databases are required.

No proprietary file formats are required.

Markdown remains standard Markdown.

The repository remains readable, diffable, portable, and tool-independent.

## Knowledge Repository Root

Repository-based knowledge can be organized in many ways, including OKF-compatible repositories, LLM Wiki repositories, project documentation, or custom Markdown knowledge repositories.

Weave Context works with any configured Knowledge Repository Root. Existing OKF-compatible repositories can be opened directly by configuring `weaveContext.notesRoot`, allowing native VS Code authoring workflows without reorganizing the repository.

Weave Context provides deterministic navigation and documentation continuity within the configured repository root. It does not require or enforce a specific repository format.

The repository is the primary artifact. The folder name is only the boundary Weave Context uses to locate and maintain its Markdown knowledge documents.

The default root is:

```text
.context/
```

The root is configurable through `weaveContext.notesRoot`. You can point Weave Context at any repository layout containing Markdown knowledge documents, including:

```text
.context/      # Weave Context default
.okf/          # an OKF-compatible repository layout
.knowledge/    # a custom knowledge repository layout
docs/          # a project documentation layout
```

## Philosophy

Weave Context is not:

- a note-taking application
- a personal knowledge management system
- a workflow engine
- a knowledge graph
- an AI workspace
- a second brain

Weave Context is:

```text
a native authoring, navigation, and continuity layer for repository-based knowledge
```

The goal is simple:

```text
Context should be navigable like code.
```

## Navigation Workflows

![Go to Definition and Hover Preview](https://raw.githubusercontent.com/ManuelGil/vscode-weave-context/main/assets/images/go-to-definition.png)

Weave Context integrates directly into native VS Code workflows.

### Go to Definition

Use:

```text
Ctrl+Click
```

or

```text
F12
```

on a wikilink:

```md
[[token-expiration]]
```

to jump directly to the referenced knowledge document.

### Find References

Use:

```text
Shift+F12
```

to discover every reference to a knowledge document across your workspace.

This makes Markdown navigation behave more like source code navigation.

### Rename Symbol

Use:

```text
F2
```

to safely rename references across the workspace.

Weave Context updates connected wikilinks while preserving navigation continuity.

This allows documentation structures to evolve without breaking references.

### Completion

Start typing:

```md
[[
```

to receive completion suggestions from:

- knowledge documents
- aliases

Multiple names can resolve to the same knowledge document while preserving deterministic navigation.

### Insert Wikilinks

Use:

```text
Weave Context: Insert note link
```

from the Command Palette.

Select a knowledge document and insert a wikilink at every active cursor location.

Examples:

```md
[[login-flow]]
```

or

```md
[[login-flow|Login Flow]]
```

depending on the document's configuration.

## Wikilinks

Weave Context supports multiple forms of navigation-friendly wikilinks.

```md
[[login-flow]]

[[login-flow|Login Flow]]

[[Login Flow]]
```

All forms participate in:

- navigation
- references
- rename
- completion

while resolving to the same knowledge document.

Wikilinks are the native authoring experience of Weave Context and remain widely used across wiki-based documentation tools. While OKF generally recommends standard Markdown links for interoperability, this is a difference in authoring syntax rather than repository structure. Existing OKF-compatible repositories can be opened by configuring `weaveContext.notesRoot`. Weave Context does not implement or require OKF.

## Frontmatter

Frontmatter is optional.

It supports navigation and readability; it does not define identity or establish a required repository schema.

Example:

```yaml
---
title: Login Flow
type: adr

aliases:
  - Login Process
  - Authentication Flow
---
```

Weave Context does not treat Markdown as a database.

Metadata remains lightweight and portable.

### Title

`title` provides a human-readable representation of a knowledge document.

It improves:

- labels
- previews
- navigation surfaces

Titles do not define identity.

Filesystem identity remains authoritative.

### Type

`type` is an optional field for classifying a knowledge document, such as `adr`, `guide`, or `runbook`.

It supports:

- filtering
- categorization
- projections in the Workspace Explorer

`type` is not required and does not define identity.

### Aliases

Aliases provide alternate navigation entry points for knowledge documents.

Example:

```md
[[Login Process]]
```

can resolve to the same knowledge document as:

```md
[[login-flow]]
```

Aliases:

- improve discoverability
- support natural naming
- preserve navigation continuity
- resolve to the same underlying knowledge document

They do not create additional knowledge documents or relationships.

## Context View

Weave Context also includes a local context visualization.

The Context View is not a global knowledge graph.

Its purpose is to visualize the immediate context around a knowledge document using the same reference model that powers:

- navigation
- references
- rename
- completion

The graph is derived entirely from explicit wikilinks.

Every visible connection corresponds to an explicit reference in your repository.

No inferred relationships are introduced.

Visualization is a consumer of the navigation model, never its authority.

## Workspace Explorer

![Workspace Explorer](https://raw.githubusercontent.com/ManuelGil/vscode-weave-context/main/assets/images/workspace-explorer.png)

Weave Context includes a lightweight navigation-oriented explorer integrated into the VS Code sidebar.

The explorer helps you navigate knowledge documents using repository projections.

Its purpose is:

- orientation
- discovery
- navigation

Not:

- workflow management
- dashboards
- graph analysis

Available projections:

| Projection | Purpose                      |
| ---------- | ---------------------------- |
| filesystem | Physical structure           |
| category   | Declared document categories |
| type       | Declared document types      |
| tags       | Lightweight grouping         |
| project    | Project-scoped navigation    |

Projections are deterministic and derived from your knowledge documents and metadata.

## Installation

Install **Weave Context** from the VS Code Marketplace.

Search:

```text
Weave Context
```

inside the Extensions view.

## Getting Started

Create or open a Knowledge Repository for engineering documentation alongside your source code. Use the same repository for architecture documentation, ADRs, implementation details, developer guides, and other project knowledge:

```text
.context/
  auth/
    login-flow.md
    token-expiration.md
```

Add references:

```md
[[token-expiration]]
```

Then use native editor workflows:

- Ctrl+Click
- F12
- Shift+F12
- F2

to navigate and maintain connected repository knowledge directly inside VS Code.

## Design Principles

### Native editor workflows first

Navigation should feel like working with code.

### Deterministic behavior

Identity and resolution must remain predictable and inspectable.

### Lightweight metadata

Metadata should support navigation, not become a management system.

### Portable Markdown

Knowledge documents remain readable, diffable, repository-friendly, and editor-independent.

## Philosophy Recap

Weave Context does not try to replace Markdown.

It does not try to replace your editor.

It does not try to become a workflow platform.

The goal is simpler:

```text
make repository-based knowledge as navigable and maintainable as source code
```

## AI Skills & Contextual Workflows

Weave Context works independently as a deterministic navigation layer for repository-based Markdown knowledge inside VS Code.

For developers using AI-assisted workflows, optional companion skills are available for tools such as:

- Claude
- Cursor
- Copilot
- Windsurf

Developers and optional AI tools can consume the same repository-based knowledge. These skills help agents follow:

- explicit Markdown references
- filesystem-backed document identity
- workflow continuity
- contextual navigation patterns

while preserving the same filesystem-first and deterministic design principles used by Weave Context itself.

Skills are completely optional and designed to complement native editor workflows rather than replace them.

Repository:

```text
[github.com/ManuelGil/weave-skills](https://github.com/ManuelGil/weave-skills)
```

## Contributing

Weave Context is open-source and welcomes community contributions:

1. Fork the [GitHub repository](https://github.com/ManuelGil/vscode-weave-context).
2. Create a new branch:

   ```bash
   git checkout -b feature/your-feature
   ```

3. Make your changes, commit them, and push to your fork.
4. Submit a Pull Request against the `main` branch.

Before contributing, please review the [Contribution Guidelines](https://github.com/ManuelGil/vscode-weave-context/blob/main/CONTRIBUTING.md) for coding standards, testing, and commit message conventions. Open an Issue if you find a bug or want to request a new feature.

## Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for all, regardless of gender, sexual orientation, disability, ethnicity, religion, or other personal characteristic. Please review our [Code of Conduct](https://github.com/ManuelGil/vscode-weave-context/blob/main/CODE_OF_CONDUCT.md) before participating in our community.

## Changelog

For a complete list of changes, see the [CHANGELOG.md](https://github.com/ManuelGil/vscode-weave-context/blob/main/CHANGELOG.md).

## Authors

- **Manuel Gil** - _Owner_ - [@ManuelGil](https://github.com/ManuelGil)

See also the list of [contributors](https://github.com/ManuelGil/vscode-weave-context/contributors) who participated in this project.

## Follow Me

- **GitHub**: [![GitHub followers](https://img.shields.io/github/followers/ManuelGil?style=for-the-badge&logo=github)](https://github.com/ManuelGil)
- **X (formerly Twitter)**: [![X Follow](https://img.shields.io/twitter/follow/imgildev?style=for-the-badge&logo=x)](https://twitter.com/imgildev)

## Other Extensions

- **[Auto Barrel](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-auto-barrel)**
  Automatically generates and maintains barrel (`index.ts`) files for your TypeScript projects.

- **[Angular File Generator](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-angular-generator)**
  Generates boilerplate and navigates your Angular (9→20+) project from within the editor, with commands for components, services, directives, modules, pipes, guards, reactive snippets, and JSON2TS transformations.

- **[NestJS File Generator](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-nestjs-generator)**
  Simplifies creation of controllers, services, modules, and more for NestJS projects, with custom commands and Swagger snippets.

- **[NestJS Snippets](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-nestjs-snippets-extension)**
  Ready-to-use code patterns for creating controllers, services, modules, DTOs, filters, interceptors, and more in NestJS.

- **[T3 Stack / NextJS / ReactJS File Generator](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-nextjs-generator)**
  Automates file creation (components, pages, hooks, API routes, etc.) in T3 Stack (Next.js, React) projects and can start your dev server from VSCode.

- **[Drizzle ORM Snippets](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-drizzle-snippets)**
  Collection of code snippets to speed up Drizzle ORM usage, defines schemas, migrations, and common database operations in TypeScript/JavaScript.

- **[CodeIgniter 4 Spark](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-codeigniter4-spark)**
  Scaffolds controllers, models, migrations, libraries, and CLI commands in CodeIgniter 4 projects using Spark, directly from the editor.

- **[CodeIgniter 4 Snippets](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-codeigniter4-snippets)**
  Snippets for accelerating development with CodeIgniter 4, including controllers, models, validations, and more.

- **[CodeIgniter 4 Shield Snippets](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-codeigniter4-shield-snippets)**
  Snippets tailored to CodeIgniter 4 Shield for faster authentication and security-related code.

- **[Mustache Template Engine - Snippets & Autocomplete](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-mustache-snippets)**
  Snippets and autocomplete support for Mustache templates, making HTML templating faster and more reliable.

## Recommended Browser Extension

For developers who work with `.vsix` files for offline installations or distribution, the complementary [**One-Click VSIX**](https://chromewebstore.google.com/detail/imojppdbcecfpeafjagncfplelddhigc?utm_source=item-share-cb) extension is recommended, available for both Chrome and Firefox.

> **One-Click VSIX** integrates a direct "Download Extension" button into each VSCode Marketplace page, ensuring the file is saved with the `.vsix` extension, even if the server provides a `.zip` archive. This simplifies the process of installing or sharing extensions offline by eliminating the need for manual file renaming.

- [Get One-Click VSIX for Chrome &rarr;](https://chromewebstore.google.com/detail/imojppdbcecfpeafjagncfplelddhigc?utm_source=item-share-cb)
- [Get One-Click VSIX for Firefox &rarr;](https://addons.mozilla.org/es-ES/firefox/addon/one-click-vsix/)

## License

This project is licensed under the **MIT License**. See the [LICENSE](https://github.com/ManuelGil/vscode-weave-context/blob/main/LICENSE) file for details.
