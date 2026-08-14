#!/usr/bin/env bash
# dsh-path-guard installer — links the plugin into dsh profiles and injects
# the patch row with YOUR guardRoots (idempotent; backs up before editing).
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILES="$DSH_HOME/profiles"
PLUGIN="path-guard"

echo "==> 收集要保护的目录"
ROOTS=("$@")
if [ "${#ROOTS[@]}" -eq 0 ]; then
  echo "请输入要保护的目录（绝对路径；多个用空格分隔；直接回车=退出）:"
  read -r -a ROOTS
fi
if [ "${#ROOTS[@]}" -eq 0 ]; then
  echo "未提供路径，退出。"
  exit 1
fi
for r in "${ROOTS[@]}"; do
  case "$r" in
    /*) ;;
    *) echo "路径必须是绝对路径: $r"; exit 1 ;;
  esac
  if [ ! -d "$r" ]; then
    echo "警告：目录不存在（仍会配置，目录创建后即生效）: $r"
  fi
done

echo "==> 链接插件到 profiles node_modules"
mkdir -p "$PROFILES/node_modules"
if [ -e "$PROFILES/node_modules/$PLUGIN" ]; then
  echo "    链接已存在，跳过: $PROFILES/node_modules/$PLUGIN"
else
  ln -s "$SRC" "$PROFILES/node_modules/$PLUGIN"
  echo "    已链接: $PROFILES/node_modules/$PLUGIN -> $SRC"
fi

patch_file() {
  local f="$1"
  if [ ! -f "$f" ]; then
    echo "    (无 $f，跳过)"
    return
  fi
  if grep -q "id: $PLUGIN" "$f"; then
    echo "    $f 已有 $PLUGIN，跳过（如需改路径请手动编辑 guardRoots）"
    return
  fi
  cp "$f" "$f.bak-$(date +%s)"
  {
    printf '\n- insert:\n    - id: %s\n      name: %s\n      config:\n        guardRoots:\n' "$PLUGIN" "$PLUGIN"
    for r in "${ROOTS[@]}"; do
      printf '          - %s\n' "$r"
    done
  } >> "$f"
  echo "    已注入 $f（备份: $f.bak-*），保护目录: ${ROOTS[*]}"
}

echo "==> 注入 patch 行"
patch_file "$PROFILES/web/cordis.patch.yml"
patch_file "$PROFILES/headless/cordis.patch.yml"

echo
echo "完成！重启 dsh web 服务后生效（例如 systemctl --user restart dsh-web），"
echo "之后新会话中这些目录对代理的读写访问都会被拒绝。"
