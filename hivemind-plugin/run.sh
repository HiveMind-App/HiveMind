#!/usr/bin/env bash
# HiveMind plugin — wrapper para lanzar el IDE sandbox.
# Usa explicitamente gradle 8 + JDK 17 (los unicos que combinan con
# org.jetbrains.intellij 1.17.4). No depende de tu PATH/JAVA_HOME global.

set -euo pipefail
cd "$(dirname "$0")"

GRADLE_BIN="/opt/homebrew/opt/gradle@8/bin/gradle"
JDK_HOME="/Users/aaangel/Library/Java/JavaVirtualMachines/ms-17.0.18/Contents/Home"

if [ ! -x "$GRADLE_BIN" ]; then
  echo "✗ No encuentro gradle 8 en $GRADLE_BIN"
  echo "  Instala con: brew install gradle@8"
  exit 1
fi
if [ ! -d "$JDK_HOME" ]; then
  echo "✗ No encuentro JDK 17 en $JDK_HOME"
  echo "  Instala uno con: brew install --cask temurin@17"
  echo "  o ajusta JDK_HOME en este script."
  exit 1
fi

export JAVA_HOME="$JDK_HOME"
export PATH="$JDK_HOME/bin:$PATH"

TASK="${1:-runIde}"

echo "▶ gradle $TASK  (gradle@8 + JDK17)"
"$GRADLE_BIN" "$TASK"
