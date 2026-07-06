# Aisphere Documentation Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Local Development

```bash
npm install
npm start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Project Structure

```text
docs/
├── kernel/       # Aisphere Kernel documentation
├── iam/          # IAM service documentation
├── hub/          # Hub service documentation
├── gateway/      # Gateway service documentation
├── git-server/   # Git Server documentation
└── guides/       # Development guides and architecture
blog/             # Blog posts
src/              # React components and pages
static/           # Static assets
```

## Deployment

The site is automatically deployed to GitHub Pages via GitHub Actions on every push to the `master` branch.

## License

MIT