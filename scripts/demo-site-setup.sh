#!/usr/bin/env bash
# Builds a disposable, gitignored runtime instance of the demo site
# fixture (fixtures/demo-site/) at .demo-runtime/, installing the
# sibling ../app-granite-cms package from a freshly built tarball.
#
# .demo-runtime is its own git repository (a real cms-agent site must
# be, since publish creates a commit inside it) - kept entirely outside
# this repo's own tracked tree and gitignored, so this repo's git never
# sees the nested .git and never hits an "embedded repository" problem.
#
# --reset wipes .demo-runtime first, so the copy step below always
# starts from a clean copy of the tracked template. Without it, an
# existing .demo-runtime is left alone (any in-progress demo edits,
# drafts, or publish history survive) and only the installed agent
# package is refreshed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_REPO="$REPO_ROOT/../app-granite-cms"
RUNTIME="$REPO_ROOT/.demo-runtime"
TEMPLATE="$REPO_ROOT/fixtures/demo-site"

GIT_IDENTITY_ENV=(
  "GIT_AUTHOR_NAME=Demo Fixture"
  "GIT_AUTHOR_EMAIL=demo-fixture@example.com"
  "GIT_COMMITTER_NAME=Demo Fixture"
  "GIT_COMMITTER_EMAIL=demo-fixture@example.com"
)

if [[ "${1:-}" == "--reset" ]]; then
  echo "Resetting: removing $RUNTIME"
  rm -rf "$RUNTIME"
fi

if [[ ! -d "$AGENT_REPO" ]]; then
  echo "Expected the sibling agent repo at $AGENT_REPO - it must be checked out alongside this repo." >&2
  exit 1
fi

IS_FRESH=false
if [[ ! -d "$RUNTIME" ]]; then
  IS_FRESH=true
  echo "Creating $RUNTIME from $TEMPLATE"
  cp -r "$TEMPLATE" "$RUNTIME"
  (cd "$RUNTIME" && git init --quiet && git add -- . && env "${GIT_IDENTITY_ENV[@]}" git commit --quiet -m "demo site fixture: initial content")
fi

echo "Building and packing the agent from $AGENT_REPO"
(cd "$AGENT_REPO" && npm run build --silent)
TARBALL_DIR=$(mktemp -d)
TARBALL_NAME=$(cd "$AGENT_REPO" && npm pack --silent --pack-destination "$TARBALL_DIR")
TARBALL_PATH="$TARBALL_DIR/$TARBALL_NAME"

echo "Installing $TARBALL_PATH into $RUNTIME/vhost"
node -e "
const fs = require('node:fs');
const path = process.argv[1] + '/vhost/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf-8'));
pkg.dependencies['@oa/cms-agent'] = 'file:' + process.argv[2];
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
" "$RUNTIME" "$TARBALL_PATH"
(cd "$RUNTIME/vhost" && npm install --silent)
rm -rf "$TARBALL_DIR"

# A fresh runtime ships with zero tokens (see fixtures/demo-site/vhost/
# site.config.json) - minted here, once per developer, rather than
# shipping one static token baked into the tracked template that every
# clone of this repo would otherwise share and that anyone reading the
# public repo could see. Only on first creation: a refresh of an
# existing .demo-runtime must not mint a second, unused token on top of
# whatever the developer is already using in their local admin.
if [[ "$IS_FRESH" == true ]]; then
  echo ""
  echo "Minting a fresh API token for this demo site..."
  "$RUNTIME/vhost/node_modules/.bin/mint-token" "$RUNTIME"
fi

echo ""
echo "Demo site ready. Run: npm run demo:start"
