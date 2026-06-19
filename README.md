# Weave Context

[![GitHub package.json version](https://img.shields.io/github/package-json/v/ManuelGil/vscode-weave-context?style=for-the-badge&logo=github)](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-weave-context)
[![GitHub Repo Stars](https://img.shields.io/github/stars/ManuelGil/vscode-weave-context?style=for-the-badge&logo=github)](https://github.com/ManuelGil/vscode-weave-context)
[![GitHub License](https://img.shields.io/github/license/ManuelGil/vscode-weave-context?style=for-the-badge&logo=github)](https://github.com/ManuelGil/vscode-weave-context/blob/main/LICENSE)

> Navigate your notes like code

Weave Context brings native semantic navigation to markdown inside VS Code.

Instead of treating notes as isolated documents, Weave Context treats markdown references like editor symbols:

- Ctrl+Click to navigate between ideas
- Rename semantic references safely
- Find references across notes
- Autocomplete wikilinks with canonical identities

Your context becomes navigable using the same workflows developers already use for code.

## Why

Code evolves quickly.

Context usually does not.

Architecture decisions, debugging trails, implementation details, trade-offs, and reasoning often become fragmented across:

- markdown notes
- temporary documentation
- pull requests
- comments
- memory

Eventually the problem becomes:

> “Where did I see this?”

Weave Context helps recover and navigate context directly inside the editor.

## What Makes It Different

Most markdown knowledge tools focus on:

- graphs
- note management
- workspace organization

Weave Context focuses on:

```text
semantic editor navigation
```

Markdown references behave like native editor primitives.

That means:

- Go to Definition for notes
- Find References across markdown
- Rename continuity for wikilinks
- Deterministic semantic navigation
- Filesystem-backed identity

## Semantic Wikilinks

Weave Context supports semantic wikilinks with canonical navigation behavior.

```md
[[login-flow]]

[[login-flow|Login Flow]]

[[Login Flow]]
```

All forms can:

- navigate
- rename
- resolve references
- participate in semantic completion

while preserving deterministic canonical identity.

## Native Editor Workflows

Weave Context integrates directly into native VS Code workflows.

### Go to Definition

Ctrl+Click or F12 on a wikilink:

```md
[[token-expiration]]
```

Jump directly to the referenced note.

### Find References

Use native references navigation:

```text
Shift + F12
```

to discover semantic references across markdown notes.

### Rename Symbol

Use:

```text
F2
```

to safely rename semantic references across the workspace while preserving aliases and navigation continuity.

### Semantic Completion

Start typing:

```md
[[
```

to autocomplete semantic note references using canonical identities and aliases.

### Insert canonical wikilinks

Use the command palette entry:

```text
Weave Context: Insert note link
```

to pick any note and insert a deterministic `[[slug]]` wikilink (or `[[slug|Title]]` when the note title differs from the canonical slug) at all active cursor locations.

## Filesystem-Backed Identity

Weave Context uses the filesystem as the canonical semantic identity layer.

This keeps references:

- deterministic
- portable
- inspectable
- compatible with standard markdown workflows

No hidden databases or proprietary note formats are required.

## Semantic Frontmatter

Weave Context supports lightweight semantic frontmatter for navigation-oriented metadata.

```yaml
---
title: Login Flow

aliases:
  - Login Process
  - Authentication Flow

status: draft
---
```

Frontmatter remains:

- optional
- portable
- filesystem-friendly

Weave Context does not use markdown as a database or workflow engine.

### Aliases

Aliases provide alternate semantic entry points for navigation.

Example:

```md
[[Login Process]]
```

can resolve to the same canonical note as:

```md
[[login-flow]]
```

Aliases:

- preserve semantic continuity
- support human-oriented naming
- remain compatible with deterministic navigation

Canonical filesystem identity always remains primary.

### Status

`status` provides lightweight navigation confidence metadata.

Examples:

```yaml
status: draft
status: stable
status: deprecated
status: hypothesis
```

Status metadata is:

- informational
- optional
- lightweight

It does not affect:

- canonical identity
- semantic resolution
- navigation targeting

## Semantic Workspace Index

Weave Context includes a lightweight semantic workspace explorer integrated into the VS Code sidebar.

The workspace index is derived from:

- the configured notes root (`weaveContext.notesRoot`, default `.context/notes`)
- normalized semantic frontmatter

It is designed for:

- fast orientation
- lightweight navigation
- semantic workspace visibility

Tree grouping uses one active projection at a time (`weaveContext.treeProjection`):

- filesystem
- category
- tags
- project

NOT:

- graph traversal
- workflow management
- metadata dashboards

## Philosophy

Weave Context is built around a simple principle:

```text
Context should be navigable like code.
```

The goal is not to create another knowledge management system.

The goal is to reduce the cognitive friction of recovering context while working.

## Design Principles

### Native editor behavior first

Weave Context prioritizes:

- Go to Definition
- Find References
- Rename Symbol
- semantic completion

over custom navigation systems.

### Deterministic semantics

Semantic navigation must remain:

- predictable
- inspectable
- filesystem-backed

No hidden semantic layers or opaque indexing systems are required.

### Lightweight metadata

Metadata exists only if it strengthens semantic navigation.

Weave Context intentionally avoids:

- workflow systems
- complex schemas
- metadata engines
- organizational overhead

### Portable markdown

Markdown files remain:

- readable
- portable
- repository-friendly
- editor-independent

Weave Context enhances markdown navigation without locking notes into proprietary formats.

## Visualization & Context Exploration

Weave Context is evolving toward richer context exploration capabilities, including:

- semantic visualization
- contextual navigation views
- graph-based exploration
- semantic workspace discovery

These capabilities are designed to extend the same deterministic semantic primitives already used by:

- navigation
- references
- rename continuity
- semantic completion

The semantic model remains primary.
Visualization is derived from it - not the other way around.

## Example

```text
notes/
  auth/
    login-flow.md
    token-expiration.md
```

```md
# login-flow.md

[[token-expiration]]
[[Login Process]]
```

Navigate between related ideas using native editor workflows:

- Ctrl+Click
- F12
- Shift+F12
- F2
- semantic completion

## Installation

Install **Weave Context** from the VS Code Marketplace:

```text
Extensions → Search: Weave Context
```

or install directly from the Marketplace page:

```text
https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-weave-context
```

## Getting Started

Create markdown notes anywhere inside your workspace:

```text
notes/
  auth/
    login-flow.md
    token-expiration.md
```

Add semantic wikilinks:

```md
[[token-expiration]]
```

Then use native editor workflows:

- Ctrl+Click
- F12
- Shift+F12
- F2

to navigate semantic context directly inside VS Code.

## Recommended Structure

Weave Context works with standard markdown files and does not require a rigid workspace structure.

Example:

```text
notes/
  architecture/
  debugging/
  decisions/
  auth/
```

Filesystem organization remains fully user-controlled.

## Current Capabilities

### Semantic navigation

- Go to Definition for wikilinks
- Find References across markdown
- Semantic rename continuity
- Deterministic semantic resolution

## TreeView - Semantic Projections

Weave Context provides a TreeView that surfaces a semantic perspective over the workspace. It is a lightweight projection layer over portable markdown and NOT a graph or metadata engine.

- **One active projection at a time:** set via workspace configuration `weaveContext.treeProjection`.
- **Projections:**

| Projection | Purpose                       |
| ---------- | ----------------------------- |
| filesystem | physical workspace structure  |
| category   | reasoning domains             |
| tags       | lightweight semantic grouping |
| project    | project-scoped navigation     |

Behavior notes:

- Projections consume only normalized semantic frontmatter (canonical model).
- Projections are flat and deterministic - no nested hierarchies or graph reconstruction.
- Notes without the active projection metadata still appear under a graceful fallback group (for example, notes without a `category` appear under “General Context”).

Example frontmatter accepted by projections:

```yaml
---
title: Login Flow
category: architecture
status: draft
aliases:
  - Login Flow
tags:
  - auth
  - session
---
```

Labels in the TreeView use `title` or the file basename. A lightweight suffix such as `(<status>)` may be shown for context only. Clicking a node opens the markdown file using native editor navigation.

The TreeView is intended to help you navigate semantic context inside the editor - it does not manage notes, run workflows, or index metadata.

### Semantic completion

- Wikilink autocomplete
- Alias-aware suggestions
- Canonical identity insertion

### Semantic frontmatter

- aliases
- status
- normalized semantic metadata

### Semantic workspace indexing

- filesystem-backed note explorer
- lightweight workspace orientation
- semantic context visibility

## Roadmap

Planned exploration areas include:

- semantic visualization
- graph-based context navigation
- richer workspace exploration
- contextual semantic search
- unresolved semantic diagnostics

Future capabilities will continue building on:

- deterministic semantic primitives
- filesystem-backed identity
- native editor workflows

## Philosophy Recap

Weave Context is not trying to replace markdown.

It is not trying to replace your editor.

It is not trying to become a workflow platform.

The goal is simpler:

```text
make context navigable with the same fluency as code
```

## AI Skills & Contextual Workflows

Weave Context works independently as a deterministic semantic navigation layer for markdown inside VS Code.

For developers using AI-assisted workflows, optional companion skills are available for tools such as:

- Claude
- Cursor
- Copilot
- Windsurf

These skills help agents better understand:

- semantic markdown context
- implementation relationships
- workflow continuity
- and contextual navigation patterns

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
