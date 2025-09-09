# simple-server

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

To run with auto-reload during development:

```bash
bun run dev
```

This uses Bun's `--watch` mode (see `package.json`). The server also handles SIGINT/SIGTERM for clean restarts.

This project was created using `bun init` in bun v1.2.8. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
